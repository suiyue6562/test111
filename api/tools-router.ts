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
/** 简单内存限流：每 IP 每分钟最多 10 次检测 */
const sktRateMap = new Map<string, number[]>();
function sktRateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (sktRateMap.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    sktRateMap.set(ip, arr);
    return false;
  }
  arr.push(now);
  sktRateMap.set(ip, arr);
  return true;
}

/** SSRF 防护：禁止指向内网/保留地址 */
function isPrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true; // 链路本地 / 云元数据
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / 阿里云内网
    return false;
  }
  const low = ip.toLowerCase();
  return (
    low === "::1" ||
    low.startsWith("fe80") ||
    low.startsWith("fc") ||
    low.startsWith("fd") ||
    low === "::"
  );
}

async function assertPublicUrl(rawUrl: string): Promise<string> {
  let base = rawUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  if (!base.endsWith("/v1")) base = `${base}/v1`;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "地址格式不正确" });
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateIp(host)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "不允许检测内网地址" });
  }
  // 解析域名，防止 DNS 指向内网
  const { lookup } = await import("node:dns/promises");
  try {
    const { address } = await lookup(host);
    if (isPrivateIp(address)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该域名解析到内网地址，已拦截" });
    }
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: "BAD_REQUEST", message: "域名无法解析" });
  }
  return base;
}

function classifyNetError(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "AbortError") return "请求超时（15s）";
    const cause = (e as { cause?: { code?: string } }).cause;
    const code = cause?.code ?? "";
    if (code === "ENOTFOUND") return "域名解析失败（站点不存在或已关闭）";
    if (code === "ECONNREFUSED") return "连接被拒绝（站点已停服或端口未开放）";
    if (code === "ECONNRESET") return "连接被重置";
    if (code.startsWith("CERT") || code.includes("SSL") || code.includes("TLS"))
      return "TLS 证书错误（证书过期或不受信任）";
    if (code === "ETIMEDOUT") return "连接超时";
  }
  return "无法连接目标站点";
}

interface SktFetchResult {
  kind: "ok" | "http" | "net";
  status?: number;
  latencyMs: number;
  models?: string[];
  errorMsg?: string;
}

async function sktFetchModels(base: string, apiKey?: string): Promise<SktFetchResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${base}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
      redirect: "manual", // 不跟随重定向，防止绕过 SSRF 防护
    });
    const latencyMs = Date.now() - started;
    if (resp.status !== 200) {
      return { kind: "http", status: resp.status, latencyMs };
    }
    const data = (await resp.json()) as { data?: Array<{ id: string }> };
    const models = Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
    return { kind: "ok", status: 200, latencyMs, models };
  } catch (e) {
    return { kind: "net", latencyMs: Date.now() - started, errorMsg: classifyNetError(e) };
  } finally {
    clearTimeout(timer);
  }
}

export const sktRouter = createRouter({
  /** Key 可用性检测：带 Key 与不带 Key 双请求对比验证 + 额度探测 */
  test: publicQuery
    .input(
      z.object({
        baseUrl: z.string().min(4).max(500),
        apiKey: z.string().min(3).max(300),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ip = (ctx.req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
      if (!sktRateLimit(ip)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "检测过于频繁，请一分钟后再试" });
      }
      const base = await assertPublicUrl(input.baseUrl);

      // 1) 带 Key 请求
      const withKey = await sktFetchModels(base, input.apiKey);
      if (withKey.kind === "net") {
        return { ok: false, verified: false, latencyMs: withKey.latencyMs, message: withKey.errorMsg! };
      }
      if (withKey.kind === "http") {
        const s = withKey.status!;
        const msg =
          s === 401
            ? "Key 无效或无权限（401）"
            : s === 403
              ? "Key 被拒绝访问（403）"
              : s === 429
                ? "站点限流中（429），Key 状态未知"
                : s === 404
                  ? "未找到 /models 接口，该站点可能不是标准 OpenAI 兼容中转"
                  : `站点返回错误状态 ${s}`;
        return { ok: false, verified: s === 401 || s === 403, latencyMs: withKey.latencyMs, httpStatus: s, message: msg };
      }

      // 2) 带 Key 成功：再发无 Key 请求做对比验证
      const models = withKey.models ?? [];
      const noKey = await sktFetchModels(base);
      const noAuth = noKey.kind === "ok"; // 不带 Key 也能拿到列表 → 站点免鉴权
      const verified = noKey.kind === "http" && (noKey.status === 401 || noKey.status === 403);

      // 3) 额度探测（尽力而为，不影响主结果）
      let quota: { hardLimitUsd: number } | null = null;
      try {
        const q = await fetch(`${base}/dashboard/billing/subscription`, {
          headers: { Authorization: `Bearer ${input.apiKey}` },
          signal: AbortSignal.timeout(6000),
        });
        if (q.ok) {
          const qd = (await q.json()) as { hard_limit_usd?: number };
          if (typeof qd?.hard_limit_usd === "number") {
            quota = { hardLimitUsd: qd.hard_limit_usd };
          }
        }
      } catch {
        /* 忽略额度探测失败 */
      }

      return {
        ok: true,
        verified,
        noAuth,
        latencyMs: withKey.latencyMs,
        httpStatus: 200,
        modelCount: models.length,
        models: models.slice(0, 100),
        quota,
        message: noAuth
          ? "模型列表获取成功，但该站点无需鉴权，无法确认 Key 真伪"
          : verified
            ? "Key 有效（已通过无 Key 对比验证）"
            : "Key 可用，模型列表获取成功",
      };
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
