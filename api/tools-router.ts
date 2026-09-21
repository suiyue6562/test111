import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  sksSubmissions,
  skrActivities,
  skrCodes,
  platforms,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";

function maskKey(key: string) {
  if (key.length <= 8) return key.slice(0, 2) + "****";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// ---------- SKS 收录申请 ----------
export const sksRouter = createRouter({
  submit: authedQuery
    .input(
      z.object({
        url: z.string().url("请输入合法网址").max(500),
        apiKey: z.string().min(8, "API Key 至少 8 位").max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const dup = await db
        .select()
        .from(sksSubmissions)
        .where(and(eq(sksSubmissions.userId, ctx.user.id), eq(sksSubmissions.url, input.url)))
        .limit(1);
      if (dup.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "你已提交过该站点，请勿重复申请" });
      }
      const [{ id }] = await db
        .insert(sksSubmissions)
        .values({
          userId: ctx.user.id,
          url: input.url,
          apiKeyMasked: maskKey(input.apiKey),
          apiKeyEnc: input.apiKey,
        })
        .$returningId();
      return { id };
    }),

  my: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({
        sub: sksSubmissions,
        platformName: platforms.name,
      })
      .from(sksSubmissions)
      .leftJoin(platforms, eq(sksSubmissions.platformId, platforms.id))
      .where(eq(sksSubmissions.userId, ctx.user.id))
      .orderBy(desc(sksSubmissions.createdAt));
    return rows.map((r) => ({
      ...r.sub,
      apiKeyEnc: undefined,
      platformName: r.platformName,
    }));
  }),
});

// ---------- SKT 检测 ----------
export const sktRouter = createRouter({
  /** 真实的 Key 可用性检测：请求目标站 /models */
  test: publicQuery
    .input(
      z.object({
        baseUrl: z.string().min(4).max(500),
        apiKey: z.string().min(3).max(300),
      }),
    )
    .mutation(async ({ input }) => {
      let base = input.baseUrl.trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
      if (!base.endsWith("/v1")) base = `${base}/v1`;
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const resp = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${input.apiKey}` },
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;
        if (!resp.ok) {
          return {
            ok: false,
            latencyMs,
            httpStatus: resp.status,
            message:
              resp.status === 401
                ? "Key 无效或无权限（401）"
                : `站点返回错误状态 ${resp.status}`,
          };
        }
        const data = (await resp.json()) as { data?: Array<{ id: string }> };
        const models = Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
        return {
          ok: true,
          latencyMs,
          httpStatus: resp.status,
          modelCount: models.length,
          models: models.slice(0, 100),
          message: "Key 可用，模型列表获取成功",
        };
      } catch (e) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          message: e instanceof Error && e.name === "AbortError" ? "请求超时（15s）" : "无法连接目标站点",
        };
      } finally {
        clearTimeout(timer);
      }
    }),
});

// ---------- SKR 发码活动 ----------
export const skrRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    const acts = await db
      .select({ act: skrActivities, creatorName: users.name, platformName: platforms.name })
      .from(skrActivities)
      .leftJoin(users, eq(skrActivities.creatorId, users.id))
      .leftJoin(platforms, eq(skrActivities.platformId, platforms.id))
      .orderBy(desc(skrActivities.createdAt));
    const stats = await db
      .select({
        activityId: skrCodes.activityId,
        total: sql<number>`count(*)`,
        claimed: sql<number>`sum(case when ${skrCodes.claimedBy} is not null then 1 else 0 end)`,
      })
      .from(skrCodes)
      .groupBy(skrCodes.activityId);
    const now = new Date();
    return acts.map((r) => {
      const s = stats.find((x) => x.activityId === r.act.id);
      let status: "scheduled" | "active" | "ended" = r.act.status;
      if (status !== "ended") {
        if (now < r.act.startAt) status = "scheduled";
        else if (r.act.endAt && now > r.act.endAt) status = "ended";
        else if (s && Number(s.claimed) >= Number(s.total)) status = "ended";
        else status = "active";
      }
      return {
        ...r.act,
        creatorName: r.creatorName,
        platformName: r.platformName,
        claimed: Number(s?.claimed ?? 0),
        status,
      };
    });
  }),

  claim: authedQuery
    .input(z.object({ activityId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [act] = await db
        .select()
        .from(skrActivities)
        .where(eq(skrActivities.id, input.activityId))
        .limit(1);
      if (!act) throw new TRPCError({ code: "NOT_FOUND", message: "活动不存在" });
      const now = new Date();
      if (now < act.startAt) throw new TRPCError({ code: "BAD_REQUEST", message: "活动尚未开始" });
      if (act.endAt && now > act.endAt) throw new TRPCError({ code: "BAD_REQUEST", message: "活动已结束" });
      // 注册天数要求
      const days = (now.getTime() - ctx.user.createdAt.getTime()) / 86400000;
      if (days < act.minRegisterDays) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `需注册满 ${act.minRegisterDays} 天才能领取`,
        });
      }
      // 领取次数限制
      const mine = await db
        .select({ n: sql<number>`count(*)` })
        .from(skrCodes)
        .where(and(eq(skrCodes.activityId, act.id), eq(skrCodes.claimedBy, ctx.user.id)));
      if (Number(mine[0]?.n ?? 0) >= act.perUserLimit) {
        throw new TRPCError({ code: "FORBIDDEN", message: "已达单用户领取上限" });
      }
      // 原子领取
      return await db.transaction(async (tx) => {
        const [code] = await tx
          .select()
          .from(skrCodes)
          .where(and(eq(skrCodes.activityId, act.id), sql`${skrCodes.claimedBy} is null`))
          .limit(1);
        if (!code) throw new TRPCError({ code: "BAD_REQUEST", message: "兑换码已被领完" });
        await tx
          .update(skrCodes)
          .set({ claimedBy: ctx.user.id, claimedAt: new Date() })
          .where(eq(skrCodes.id, code.id));
        return { code: code.code };
      });
    }),

  myCodes: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({ code: skrCodes, actTitle: skrActivities.title, platformName: platforms.name })
      .from(skrCodes)
      .leftJoin(skrActivities, eq(skrCodes.activityId, skrActivities.id))
      .leftJoin(platforms, eq(skrActivities.platformId, platforms.id))
      .where(eq(skrCodes.claimedBy, ctx.user.id))
      .orderBy(desc(skrCodes.claimedAt));
    return rows.map((r) => ({ ...r.code, actTitle: r.actTitle, platformName: r.platformName }));
  }),
});
