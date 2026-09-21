import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  users,
  platforms,
  platformPrices,
  platformDailyStatus,
  reviews,
  forumPosts,
  forumComments,
  sksSubmissions,
  skrActivities,
  skrCodes,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, adminQuery } from "./middleware";

const platformInput = z.object({
  name: z.string().min(1).max(120),
  domain: z.string().min(3).max(255),
  url: z.string().url().max(500),
  apiBaseUrl: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  vendors: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  status: z.enum(["operational", "slow", "down", "unknown"]).default("unknown"),
  stage: z.enum(["new", "stable", "watch", "closed"]).default("new"),
  featured: z.boolean().default(false),
  isAd: z.boolean().default(false),
  adWeight: z.number().int().min(0).max(9999).default(0),
  adExpireAt: z.string().nullable().optional(),
});

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 把表单输入转成数据库可写字段（adExpireAt 字符串 → Date） */
function normalizePlatformInput<T extends { adExpireAt?: string | null }>(input: T) {
  const { adExpireAt, ...rest } = input;
  return { ...rest, adExpireAt: adExpireAt ? new Date(adExpireAt) : null };
}

export const adminRouter = createRouter({
  /** 仪表盘统计 */
  stats: adminQuery.query(async () => {
    const db = getDb();
    const [p] = await db.select({ n: sql<number>`count(*)` }).from(platforms);
    const [u] = await db.select({ n: sql<number>`count(*)` }).from(users);
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(reviews);
    const [po] = await db.select({ n: sql<number>`count(*)` }).from(forumPosts);
    const [sub] = await db
      .select({ n: sql<number>`count(*)` })
      .from(sksSubmissions)
      .where(eq(sksSubmissions.status, "pending"));
    const [act] = await db
      .select({ n: sql<number>`count(*)` })
      .from(skrActivities)
      .where(eq(skrActivities.status, "active"));
    return {
      platforms: p.n,
      users: u.n,
      reviews: r.n,
      posts: po.n,
      pendingSubmissions: sub.n,
      activeActivities: act.n,
    };
  }),

  // ---------- 平台管理 ----------
  listPlatforms: adminQuery.query(async () => {
    return getDb().select().from(platforms).orderBy(desc(platforms.createdAt));
  }),

  createPlatform: adminQuery.input(platformInput).mutation(async ({ input }) => {
    const db = getDb();
    const dup = await db.select().from(platforms).where(eq(platforms.domain, input.domain)).limit(1);
    if (dup.length > 0) throw new TRPCError({ code: "CONFLICT", message: "域名已存在" });
    const [{ id }] = await db.insert(platforms).values({
      ...normalizePlatformInput(input),
      apiBaseUrl: input.apiBaseUrl || `${input.url.replace(/\/+$/, "")}/v1`,
    }).$returningId();
    // 初始化近 30 天监控为空数据
    const rows = [];
    for (let d = 29; d >= 0; d--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      rows.push({
        platformId: id,
        date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
        status: "nodata" as const,
      });
    }
    await db.insert(platformDailyStatus).values(rows);
    return { id };
  }),

  updatePlatform: adminQuery
    .input(platformInput.extend({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(platforms).set(normalizePlatformInput(data)).where(eq(platforms.id, id));
      return { success: true };
    }),

  deletePlatform: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(platformDailyStatus).where(eq(platformDailyStatus.platformId, input.id));
      await db.delete(platformPrices).where(eq(platformPrices.platformId, input.id));
      await db.delete(reviews).where(eq(reviews.platformId, input.id));
      await db.delete(platforms).where(eq(platforms.id, input.id));
      return { success: true };
    }),

  /** 录入/更新某一天监控 */
  upsertDailyStatus: adminQuery
    .input(
      z.object({
        platformId: z.number(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(["ok", "slow", "down", "nodata"]),
        latencyMs: z.number().int().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .insert(platformDailyStatus)
        .values(input)
        .onDuplicateKeyUpdate({ set: { status: input.status, latencyMs: input.latencyMs } });
      return { success: true };
    }),

  // ---------- 价格管理 ----------
  listPrices: adminQuery
    .input(z.object({ platformId: z.number() }))
    .query(async ({ input }) => {
      return getDb().select().from(platformPrices).where(eq(platformPrices.platformId, input.platformId));
    }),

  upsertPrice: adminQuery
    .input(
      z.object({
        id: z.number().optional(),
        platformId: z.number(),
        vendor: z.string().min(1),
        model: z.string().min(1),
        groupName: z.string().default("default"),
        ratio: z.string(),
        shortCost: z.string(),
        longCost: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      if (id) {
        await db.update(platformPrices).set(data).where(eq(platformPrices.id, id));
      } else {
        await db.insert(platformPrices).values(data);
      }
      return { success: true };
    }),

  deletePrice: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(platformPrices).where(eq(platformPrices.id, input.id));
      return { success: true };
    }),

  // ---------- 收录审核 ----------
  listSubmissions: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({ sub: sksSubmissions, userName: users.name })
      .from(sksSubmissions)
      .leftJoin(users, eq(sksSubmissions.userId, users.id))
      .orderBy(desc(sksSubmissions.createdAt));
  }),

  reviewSubmission: adminQuery
    .input(
      z.object({
        id: z.number(),
        approve: z.boolean(),
        note: z.string().max(500).optional(),
        // 通过时的平台信息
        platform: platformInput.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [sub] = await db.select().from(sksSubmissions).where(eq(sksSubmissions.id, input.id)).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "申请不存在" });
      if (sub.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "该申请已处理" });
      let platformId: number | null = null;
      if (input.approve) {
        if (!input.platform) throw new TRPCError({ code: "BAD_REQUEST", message: "通过时需填写平台信息" });
        const [{ id: pid }] = await db
          .insert(platforms)
          .values({
            ...normalizePlatformInput(input.platform),
            apiBaseUrl: input.platform.apiBaseUrl || `${input.platform.url.replace(/\/+$/, "")}/v1`,
          })
          .$returningId();
        platformId = pid;
        const rows = [];
        for (let d = 29; d >= 0; d--) {
          const dt = new Date();
          dt.setDate(dt.getDate() - d);
          rows.push({
            platformId: pid,
            date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
            status: "nodata" as const,
          });
        }
        await db.insert(platformDailyStatus).values(rows);
      }
      await db
        .update(sksSubmissions)
        .set({
          status: input.approve ? "approved" : "rejected",
          reviewNote: input.note ?? null,
          platformId,
          reviewedAt: new Date(),
        })
        .where(eq(sksSubmissions.id, input.id));
      return { success: true };
    }),

  // ---------- 点评管理 ----------
  listReviews: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({ review: reviews, userName: users.name, platformName: platforms.name })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .leftJoin(platforms, eq(reviews.platformId, platforms.id))
      .orderBy(desc(reviews.createdAt))
      .limit(200);
  }),

  setReviewStatus: adminQuery
    .input(z.object({ id: z.number(), status: z.enum(["published", "hidden"]) }))
    .mutation(async ({ input }) => {
      await getDb().update(reviews).set({ status: input.status }).where(eq(reviews.id, input.id));
      return { success: true };
    }),

  // ---------- 论坛管理 ----------
  listPosts: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({ post: forumPosts, userName: users.name, catName: forumPosts.categoryId })
      .from(forumPosts)
      .leftJoin(users, eq(forumPosts.userId, users.id))
      .orderBy(desc(forumPosts.createdAt))
      .limit(200);
  }),

  setPostStatus: adminQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["published", "hidden"]).optional(),
        pinned: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const data: Record<string, unknown> = {};
      if (input.status) data.status = input.status;
      if (input.pinned !== undefined) data.pinned = input.pinned;
      await getDb().update(forumPosts).set(data).where(eq(forumPosts.id, input.id));
      return { success: true };
    }),

  deleteComment: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().update(forumComments).set({ status: "hidden" }).where(eq(forumComments.id, input.id));
      return { success: true };
    }),

  // ---------- 活动管理 ----------
  listActivities: adminQuery.query(async () => {
    const db = getDb();
    const acts = await db.select().from(skrActivities).orderBy(desc(skrActivities.createdAt));
    const stats = await db
      .select({
        activityId: skrCodes.activityId,
        total: sql<number>`count(*)`,
        claimed: sql<number>`sum(case when ${skrCodes.claimedBy} is not null then 1 else 0 end)`,
      })
      .from(skrCodes)
      .groupBy(skrCodes.activityId);
    return acts.map((a) => ({
      ...a,
      codeCount: Number(stats.find((s) => s.activityId === a.id)?.total ?? 0),
      claimed: Number(stats.find((s) => s.activityId === a.id)?.claimed ?? 0),
    }));
  }),

  createActivity: adminQuery
    .input(
      z.object({
        title: z.string().min(2).max(200),
        description: z.string().max(2000).optional(),
        platformId: z.number().optional(),
        totalCodes: z.number().int().min(1).max(5000),
        perUserLimit: z.number().int().min(1).max(10).default(1),
        minRegisterDays: z.number().int().min(0).max(365).default(0),
        startAt: z.string(),
        endAt: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const startAt = new Date(input.startAt);
      const endAt = input.endAt ? new Date(input.endAt) : null;
      const [{ id }] = await db
        .insert(skrActivities)
        .values({
          creatorId: ctx.user.id,
          title: input.title,
          description: input.description ?? "",
          platformId: input.platformId ?? null,
          totalCodes: input.totalCodes,
          perUserLimit: input.perUserLimit,
          minRegisterDays: input.minRegisterDays,
          startAt,
          endAt,
          status: startAt > new Date() ? "scheduled" : "active",
        })
        .$returningId();
      // 生成兑换码
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const codes = [];
      for (let i = 0; i < input.totalCodes; i++) {
        let code = "";
        for (let j = 0; j < 12; j++) {
          code += chars[Math.floor(Math.random() * chars.length)];
          if (j % 4 === 3 && j < 11) code += "-";
        }
        codes.push({ activityId: id, code });
      }
      for (let k = 0; k < codes.length; k += 200) {
        await db.insert(skrCodes).values(codes.slice(k, k + 200));
      }
      return { id };
    }),

  endActivity: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().update(skrActivities).set({ status: "ended" }).where(eq(skrActivities.id, input.id));
      return { success: true };
    }),

  // ---------- 用户管理 ----------
  listUsers: adminQuery.query(async () => {
    return getDb()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
  }),

  setUserStatus: adminQuery
    .input(z.object({ id: z.number(), status: z.enum(["active", "banned"]) }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能操作自己的账号" });
      }
      await getDb().update(users).set({ status: input.status }).where(eq(users.id, input.id));
      return { success: true };
    }),

  setUserRole: adminQuery
    .input(z.object({ id: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }
      await getDb().update(users).set({ role: input.role }).where(eq(users.id, input.id));
      return { success: true };
    }),
});
