import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  users,
  platforms,
  platformPrices,
  platformDailyStatus,
  collectorRuns,
  reviews,
  forumPosts,
  forumComments,
  sksSubmissions,
  skrActivities,
  skrCodes,
  visitLogs,
  adImpressions,
  adCampaigns,
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
      // 管理员手动编辑后重置自动隐藏标记，避免与自动恢复逻辑冲突
      await db.update(platforms).set({ ...normalizePlatformInput(data), autoClosed: false }).where(eq(platforms.id, id));
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

  // ---------- 采集监控 ----------
  /** 总览：站点状态分布、价格数据规模、最近一次探测/价格采集 */
  collectorOverview: adminQuery.query(async () => {
    const db = getDb();
    const statusRows = await db
      .select({ status: platforms.status, n: sql<number>`count(*)` })
      .from(platforms)
      .groupBy(platforms.status);
    const [price] = await db
      .select({
        total: sql<number>`count(*)`,
        sites: sql<number>`count(distinct ${platformPrices.platformId})`,
      })
      .from(platformPrices);
    const [lastProbe] = await db
      .select()
      .from(collectorRuns)
      .where(eq(collectorRuns.type, "probe"))
      .orderBy(desc(collectorRuns.id))
      .limit(1);
    const [lastPricing] = await db
      .select()
      .from(collectorRuns)
      .where(eq(collectorRuns.type, "pricing"))
      .orderBy(desc(collectorRuns.id))
      .limit(1);
    const dist: Record<string, number> = { operational: 0, slow: 0, down: 0, unknown: 0 };
    for (const r of statusRows) dist[r.status] = Number(r.n);
    return {
      statusDist: dist,
      priceTotal: Number(price?.total ?? 0),
      priceSites: Number(price?.sites ?? 0),
      lastProbe: lastProbe ?? null,
      lastPricing: lastPricing ?? null,
    };
  }),

  /** 近 14 天探测趋势（每天 ok/slow/down/nodata 数量） */
  collectorTrend: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        date: platformDailyStatus.date,
        status: platformDailyStatus.status,
        n: sql<number>`count(*)`,
        avgLatency: sql<number>`round(avg(${platformDailyStatus.latencyMs}))`,
      })
      .from(platformDailyStatus)
      .groupBy(platformDailyStatus.date, platformDailyStatus.status)
      .orderBy(desc(platformDailyStatus.date))
      .limit(14 * 4);
    const byDate = new Map<string, { date: string; ok: number; slow: number; down: number; nodata: number; avgLatency: number | null }>();
    for (const r of rows) {
      if (!byDate.has(r.date)) {
        byDate.set(r.date, { date: r.date, ok: 0, slow: 0, down: 0, nodata: 0, avgLatency: null });
      }
      const d = byDate.get(r.date)!;
      d[r.status] = Number(r.n);
      if (r.status === "ok" && r.avgLatency != null) d.avgLatency = Number(r.avgLatency);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }),

  /** 最近采集运行记录 */
  collectorRuns: adminQuery.query(async () => {
    return getDb().select().from(collectorRuns).orderBy(desc(collectorRuns.id)).limit(30);
  }),

  /** 当前故障/未确认的站点列表 */
  collectorDownSites: adminQuery.query(async () => {
    const db = getDb();
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    return db
      .select({
        id: platforms.id,
        name: platforms.name,
        domain: platforms.domain,
        url: platforms.url,
        status: platforms.status,
        score: platforms.score,
        todayStatus: platformDailyStatus.status,
        todayLatency: platformDailyStatus.latencyMs,
      })
      .from(platforms)
      .leftJoin(
        platformDailyStatus,
        sql`${platformDailyStatus.platformId} = ${platforms.id} AND ${platformDailyStatus.date} = ${dateStr}`,
      )
      .where(sql`${platforms.status} IN ('down','unknown') AND ${platforms.stage} != 'closed'`)
      .orderBy(desc(platforms.score))
      .limit(100);
  }),

  /** 广告投放效果：每个广告位的曝光、点击、点击率 */
  adStats: adminQuery.query(async () => {
    const db = getDb();
    const ads = await db
      .select()
      .from(platforms)
      .where(eq(platforms.isAd, true))
      .orderBy(desc(platforms.adWeight));
    if (ads.length === 0) return [];
    const since7 = new Date(Date.now() - 7 * 86400_000);

    const imps = await db
      .select({
        platformId: adImpressions.platformId,
        position: adImpressions.position,
        n: sql<number>`count(*)`,
        n7: sql<number>`sum(case when ${adImpressions.createdAt} >= ${since7} then 1 else 0 end)`,
      })
      .from(adImpressions)
      .where(inArray(adImpressions.platformId, ads.map((a) => a.id)))
      .groupBy(adImpressions.platformId, adImpressions.position);

    const clicks = await db
      .select({
        platformId: visitLogs.platformId,
        n: sql<number>`count(*)`,
        n7: sql<number>`sum(case when ${visitLogs.createdAt} >= ${since7} then 1 else 0 end)`,
      })
      .from(visitLogs)
      .where(
        and(
          inArray(visitLogs.platformId, ads.map((a) => a.id)),
          inArray(visitLogs.source, ["ad-home", "ad-list"]),
        ),
      )
      .groupBy(visitLogs.platformId);

    return ads.map((a) => {
      const impRows = imps.filter((i) => i.platformId === a.id);
      const impTotal = impRows.reduce((s, i) => s + Number(i.n), 0);
      const imp7 = impRows.reduce((s, i) => s + Number(i.n7), 0);
      const impHome = Number(impRows.find((i) => i.position === "home")?.n ?? 0);
      const impList = Number(impRows.find((i) => i.position === "list")?.n ?? 0);
      const ck = clicks.find((c) => c.platformId === a.id);
      const clkTotal = Number(ck?.n ?? 0);
      const clk7 = Number(ck?.n7 ?? 0);
      return {
        id: a.id,
        name: a.name,
        domain: a.domain,
        status: a.status,
        adWeight: a.adWeight,
        adExpireAt: a.adExpireAt,
        adLive: !a.adExpireAt || a.adExpireAt.getTime() > Date.now(),
        impTotal,
        imp7,
        impHome,
        impList,
        clkTotal,
        clk7,
        ctr7: imp7 > 0 ? Math.round((clk7 / imp7) * 1000) / 10 : null,
        ctrTotal: impTotal > 0 ? Math.round((clkTotal / impTotal) * 1000) / 10 : null,
      };
    });
  }),

  /** 广告位活动列表（顶部/底部/左侧/右侧/弹窗），含 7 天曝光/点击/CTR */
  listCampaigns: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({ campaign: adCampaigns, platformName: platforms.name, domain: platforms.domain, status: platforms.status })
      .from(adCampaigns)
      .innerJoin(platforms, eq(adCampaigns.platformId, platforms.id))
      .orderBy(desc(adCampaigns.createdAt));
    if (rows.length === 0) return [];
    const since7 = new Date(Date.now() - 7 * 86400_000);
    const ids = rows.map((r) => r.campaign.platformId);
    const imps = await db
      .select({
        platformId: adImpressions.platformId,
        position: adImpressions.position,
        n: sql<number>`count(*)`,
        n7: sql<number>`sum(case when ${adImpressions.createdAt} >= ${since7} then 1 else 0 end)`,
      })
      .from(adImpressions)
      .where(inArray(adImpressions.platformId, ids))
      .groupBy(adImpressions.platformId, adImpressions.position);
    const clicks = await db
      .select({
        platformId: visitLogs.platformId,
        source: visitLogs.source,
        n: sql<number>`count(*)`,
        n7: sql<number>`sum(case when ${visitLogs.createdAt} >= ${since7} then 1 else 0 end)`,
      })
      .from(visitLogs)
      .where(and(inArray(visitLogs.platformId, ids), sql`${visitLogs.source} IS NOT NULL`))
      .groupBy(visitLogs.platformId, visitLogs.source);
    return rows.map((r) => {
      const imp = imps.find(
        (i) => i.platformId === r.campaign.platformId && i.position === r.campaign.position,
      );
      const ck = clicks.find(
        (c) => c.platformId === r.campaign.platformId && c.source === `ad-${r.campaign.position}`,
      );
      const imp7 = Number(imp?.n7 ?? 0);
      const clk7 = Number(ck?.n7 ?? 0);
      return {
        id: r.campaign.id,
        platformId: r.campaign.platformId,
        platformName: r.platformName,
        domain: r.domain,
        platformStatus: r.status,
        position: r.campaign.position,
        weight: r.campaign.weight,
        expireAt: r.campaign.expireAt,
        live: !r.campaign.expireAt || r.campaign.expireAt.getTime() > Date.now(),
        imp7,
        clk7,
        impTotal: Number(imp?.n ?? 0),
        clkTotal: Number(ck?.n ?? 0),
        ctr7: imp7 > 0 ? Math.round((clk7 / imp7) * 1000) / 10 : null,
      };
    });
  }),

  createCampaign: adminQuery
    .input(
      z.object({
        platformId: z.number(),
        position: z.enum(["top", "bottom", "left", "right", "popup"]),
        weight: z.number().int().min(0).max(9999).default(0),
        expireAt: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [p] = await db.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, input.platformId)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "站点不存在" });
      const dup = await db
        .select({ id: adCampaigns.id })
        .from(adCampaigns)
        .where(and(eq(adCampaigns.platformId, input.platformId), eq(adCampaigns.position, input.position)))
        .limit(1);
      if (dup.length > 0) throw new TRPCError({ code: "CONFLICT", message: "该站点在此位置已有广告活动" });
      const [{ id }] = await db
        .insert(adCampaigns)
        .values({
          platformId: input.platformId,
          position: input.position,
          weight: input.weight,
          expireAt: input.expireAt ? new Date(input.expireAt) : null,
        })
        .$returningId();
      return { id };
    }),

  deleteCampaign: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(adCampaigns).where(eq(adCampaigns.id, input.id));
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
