import { z } from "zod";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  platforms,
  platformDailyStatus,
  reviews,
  favorites,
  visitLogs,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 组装平台卡片数据：30 天状态、可用率、平均延迟 */
async function withStats(db: ReturnType<typeof getDb>, rows: typeof platforms.$inferSelect[]) {
  if (rows.length === 0) return [];
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceStr = dateStr(since);
  const stats = await db
    .select()
    .from(platformDailyStatus)
    .where(
      and(
        inArray(platformDailyStatus.platformId, rows.map((r) => r.id)),
        sql`${platformDailyStatus.date} >= ${sinceStr}`,
      ),
    );
  const byPlatform = new Map<number, typeof stats>();
  for (const s of stats) {
    const arr = byPlatform.get(s.platformId) ?? [];
    arr.push(s);
    byPlatform.set(s.platformId, arr);
  }
  return rows.map((p) => {
    const days = (byPlatform.get(p.id) ?? []).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const measured = days.filter((d) => d.status !== "nodata");
    const okDays = measured.filter((d) => d.status === "ok").length;
    const uptime = measured.length > 0 ? (okDays / measured.length) * 100 : null;
    const lat = measured.filter((d) => d.latencyMs != null);
    const avgLatency =
      lat.length > 0
        ? Math.round(lat.reduce((a, b) => a + (b.latencyMs ?? 0), 0) / lat.length)
        : null;
    return { ...p, daily: days, uptime, avgLatency };
  });
}

const sortEnum = z.enum(["default", "uptime", "latency", "visits", "newest"]);

/** 新站扶持期（天）：扶持期内默认排序加权 */
const NEW_SITE_DAYS = 14;
/** 新站默认排序加成分 */
const NEW_SITE_BOOST = 8;
/** 列表页广告置顶数量上限（保护用户体验） */
const AD_PIN_LIMIT = 3;

function isAdActive(p: { isAd: boolean; adExpireAt: Date | null }) {
  return p.isAd && (!p.adExpireAt || p.adExpireAt.getTime() > Date.now());
}

function ageDays(p: { createdAt: Date }) {
  return (Date.now() - p.createdAt.getTime()) / 86400_000;
}

export const platformRouter = createRouter({
  /** 首页四层推荐流：广告主 → 优秀站 → 爆款站 → 新站 */
  homeFeed: publicQuery.query(async () => {
    const db = getDb();
    const picked = new Set<number>();
    const take = (rows: typeof platforms.$inferSelect[], n: number) => {
      const out = [];
      for (const r of rows) {
        if (picked.has(r.id)) continue;
        picked.add(r.id);
        out.push(r);
        if (out.length >= n) break;
      }
      return out;
    };

    // 1) 广告主：未过期，按权重
    const adRows = await db
      .select()
      .from(platforms)
      .where(
        and(
          eq(platforms.isAd, true),
          or(sql`${platforms.adExpireAt} IS NULL`, sql`${platforms.adExpireAt} > NOW()`),
        ),
      )
      .orderBy(desc(platforms.adWeight), desc(platforms.score))
      .limit(6);
    const ads = take(adRows, 3);

    // 2) 优秀站：正常运营 + 综合评分最高
    const excellentRows = await db
      .select()
      .from(platforms)
      .where(and(eq(platforms.status, "operational"), sql`${platforms.stage} != 'closed'`))
      .orderBy(desc(platforms.score), desc(platforms.visitCount))
      .limit(12);
    const excellent = take(excellentRows, 6);

    // 3) 爆款站：近 7 天真实访问量最高（无访问数据时回退到历史总访问量）
    const since7 = new Date(Date.now() - 7 * 86400_000);
    const hotIds = await db
      .select({ platformId: visitLogs.platformId, c: sql<number>`count(*)` })
      .from(visitLogs)
      .where(sql`${visitLogs.createdAt} >= ${since7}`)
      .groupBy(visitLogs.platformId)
      .orderBy(desc(sql`count(*)`))
      .limit(12);
    let hotRows: typeof platforms.$inferSelect[] = [];
    if (hotIds.length > 0) {
      const rows = await db
        .select()
        .from(platforms)
        .where(inArray(platforms.id, hotIds.map((h) => h.platformId)));
      const order = new Map(hotIds.map((h, i) => [h.platformId, i]));
      hotRows = rows.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    } else {
      hotRows = await db
        .select()
        .from(platforms)
        .where(sql`${platforms.stage} != 'closed'`)
        .orderBy(desc(platforms.visitCount))
        .limit(12);
    }
    const hot = take(hotRows, 6);

    // 4) 新站速递：30 天内收录，最新在前
    const since30 = new Date(Date.now() - 30 * 86400_000);
    const newRows = await db
      .select()
      .from(platforms)
      .where(and(sql`${platforms.createdAt} >= ${since30}`, sql`${platforms.stage} != 'closed'`))
      .orderBy(desc(platforms.createdAt))
      .limit(12);
    const newSites = take(newRows, 6);

    return {
      ads: await withStats(db, ads),
      excellent: await withStats(db, excellent),
      hot: await withStats(db, hot),
      newSites: await withStats(db, newSites),
    };
  }),

  /** 首页精选：按综合评分排序 */
  featured: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(platforms)
      .where(eq(platforms.featured, true))
      .orderBy(desc(platforms.score), desc(platforms.visitCount))
      .limit(18);
    return withStats(db, rows);
  }),

  /** 首页赞助广告位：未过期的广告按权重排序 */
  adSlots: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(platforms)
      .where(
        and(
          eq(platforms.isAd, true),
          or(
            sql`${platforms.adExpireAt} IS NULL`,
            sql`${platforms.adExpireAt} > NOW()`,
          ),
        ),
      )
      .orderBy(desc(platforms.adWeight), desc(platforms.score))
      .limit(3);
    return withStats(db, rows);
  }),

  /** 综合筛选 */
  list: publicQuery
    .input(
      z.object({
        search: z.string().optional(),
        vendors: z.array(z.string()).optional(),
        status: z.array(z.string()).optional(),
        stage: z.array(z.string()).optional(),
        sort: sortEnum.default("default"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(60).default(24),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds = [];
      if (input.search) {
        const q = `%${input.search}%`;
        conds.push(
          or(
            like(platforms.name, q),
            like(platforms.domain, q),
            like(platforms.description, q),
          ),
        );
      }
      if (input.status?.length)
        conds.push(
          inArray(platforms.status, input.status as Array<"operational" | "slow" | "down" | "unknown">),
        );
      if (input.stage?.length)
        conds.push(
          inArray(platforms.stage, input.stage as Array<"new" | "stable" | "watch" | "closed">),
        );
      let rows = await db
        .select()
        .from(platforms)
        .where(conds.length ? and(...conds) : undefined);
      if (input.vendors?.length) {
        rows = rows.filter((r) =>
          input.vendors!.some((v) => (r.vendors as string[]).includes(v)),
        );
      }
      let result = (await withStats(db, rows)).map((r) => ({
        ...r,
        adActive: isAdActive(r),
      }));
      switch (input.sort) {
        case "uptime":
          result.sort((a, b) => (b.uptime ?? -1) - (a.uptime ?? -1));
          break;
        case "latency":
          result.sort(
            (a, b) => (a.avgLatency ?? Infinity) - (b.avgLatency ?? Infinity),
          );
          break;
        case "visits":
          result.sort((a, b) => b.visitCount - a.visitCount);
          break;
        case "newest":
          result.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          break;
        default: {
          // 混合推荐：未过期广告按权重置顶（限 3 个，保护体验）；
          // 其余按综合评分排序，扶持期内新站加分获得冷启动曝光
          const ads = result
            .filter((r) => r.adActive)
            .sort((a, b) => b.adWeight - a.adWeight || Number(b.score) - Number(a.score))
            .slice(0, AD_PIN_LIMIT);
          const adIds = new Set(ads.map((a) => a.id));
          const rest = result
            .filter((r) => !adIds.has(r.id))
            .sort((a, b) => {
              const sa = Number(a.score) + (ageDays(a) <= NEW_SITE_DAYS ? NEW_SITE_BOOST : 0);
              const sb = Number(b.score) + (ageDays(b) <= NEW_SITE_DAYS ? NEW_SITE_BOOST : 0);
              return sb - sa || b.visitCount - a.visitCount;
            });
          result = [...ads, ...rest];
        }
      }
      const total = result.length;
      const start = (input.page - 1) * input.pageSize;
      return { total, items: result.slice(start, start + input.pageSize) };
    }),

  /** 站点详情（按域名） */
  detail: publicQuery
    .input(z.object({ domain: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(platforms)
        .where(eq(platforms.domain, input.domain))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "站点不存在" });
      const [withS] = await withStats(db, [p]);
      const rv = await db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          content: reviews.content,
          createdAt: reviews.createdAt,
          userName: users.name,
        })
        .from(reviews)
        .leftJoin(users, eq(reviews.userId, users.id))
        .where(and(eq(reviews.platformId, p.id), eq(reviews.status, "published")))
        .orderBy(desc(reviews.createdAt));
      const avgRating =
        rv.length > 0
          ? Math.round((rv.reduce((a, b) => a + b.rating, 0) / rv.length) * 10) / 10
          : null;
      let isFav = false;
      if (ctx.user) {
        const f = await db
          .select()
          .from(favorites)
          .where(and(eq(favorites.userId, ctx.user.id), eq(favorites.platformId, p.id)))
          .limit(1);
        isFav = f.length > 0;
      }
      return { platform: withS, reviews: rv, avgRating, reviewCount: rv.length, isFav };
    }),

  /** 对比 */
  compare: publicQuery
    .input(z.object({ ids: z.array(z.number()).min(2).max(6) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(platforms)
        .where(inArray(platforms.id, input.ids));
      return withStats(db, rows);
    }),

  /** 记录访问并返回目标地址 */
  visit: publicQuery
    .input(z.object({ platformId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(platforms)
        .where(eq(platforms.id, input.platformId))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "站点不存在" });
      await db.insert(visitLogs).values({
        platformId: p.id,
        userId: ctx.user?.id ?? null,
      });
      await db
        .update(platforms)
        .set({ visitCount: p.visitCount + 1 })
        .where(eq(platforms.id, p.id));
      return { url: p.url };
    }),

  /** 收藏切换 */
  toggleFavorite: authedQuery
    .input(z.object({ platformId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [fav] = await db
        .select()
        .from(favorites)
        .where(
          and(eq(favorites.userId, ctx.user.id), eq(favorites.platformId, input.platformId)),
        )
        .limit(1);
      if (fav) {
        await db.delete(favorites).where(eq(favorites.id, fav.id));
        return { favorited: false };
      }
      await db.insert(favorites).values({
        userId: ctx.user.id,
        platformId: input.platformId,
      });
      return { favorited: true };
    }),

  /** 我的收藏 */
  myFavorites: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const favs = await db
      .select({ platformId: favorites.platformId })
      .from(favorites)
      .where(eq(favorites.userId, ctx.user.id));
    if (favs.length === 0) return [];
    const rows = await db
      .select()
      .from(platforms)
      .where(inArray(platforms.id, favs.map((f) => f.platformId)));
    return withStats(db, rows);
  }),
});
