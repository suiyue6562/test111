import { z } from "zod";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  platforms,
  platformDailyStatus,
  reviews,
  favorites,
  visitLogs,
  adImpressions,
  adCampaigns,
  adInquiries,
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

/** 广告位区域（除首页/列表内置位外的独立广告区） */
const ZONE_POSITIONS = ["top", "bottom", "left", "right", "popup"] as const;
type ZonePosition = (typeof ZONE_POSITIONS)[number];
/** 每个区域同时展示的广告数量上限 */
const ZONE_LIMIT: Record<ZonePosition, number> = { top: 1, bottom: 1, left: 2, right: 2, popup: 1 };

/** 校验某平台在指定位置是否有进行中的广告（首页/列表看 isAd 标记，区域位看 ad_campaigns） */
async function hasLiveAd(
  db: ReturnType<typeof getDb>,
  p: { id: number; isAd: boolean; adExpireAt: Date | null },
  position: string,
) {
  if ((position === "home" || position === "list") && isAdActive(p)) return true;
  if ((ZONE_POSITIONS as readonly string[]).includes(position)) {
    const rows = await db
      .select({ id: adCampaigns.id })
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.platformId, p.id),
          eq(adCampaigns.position, position as ZonePosition),
          or(sql`${adCampaigns.expireAt} IS NULL`, sql`${adCampaigns.expireAt} > NOW()`),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  return false;
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

    // 1) 广告主：未过期，按权重（故障站不展示广告——保护用户也保护广告主预算）
    const adRows = await db
      .select()
      .from(platforms)
      .where(
        and(
          eq(platforms.isAd, true),
          sql`${platforms.status} != 'down'`,
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
    // 当前故障的站不推荐——用户点了打不开是最差体验
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
        .where(
          and(
            inArray(platforms.id, hotIds.map((h) => h.platformId)),
            sql`${platforms.status} != 'down'`,
            sql`${platforms.stage} != 'closed'`,
          ),
        );
      const order = new Map(hotIds.map((h, i) => [h.platformId, i]));
      hotRows = rows.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    } else {
      hotRows = await db
        .select()
        .from(platforms)
        .where(sql`${platforms.stage} != 'closed' AND ${platforms.status} != 'down'`)
        .orderBy(desc(platforms.visitCount))
        .limit(12);
    }
    const hot = take(hotRows, 6);

    // 4) 新站速递：30 天内收录，最新在前（故障站不推荐）
    const since30 = new Date(Date.now() - 30 * 86400_000);
    const newRows = await db
      .select()
      .from(platforms)
      .where(
        and(
          sql`${platforms.createdAt} >= ${since30}`,
          sql`${platforms.stage} != 'closed'`,
          sql`${platforms.status} != 'down'`,
        ),
      )
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
      else
        // 默认隐藏已关闭站点（自动隐藏的死站不再打扰用户；显式筛选"已关闭"时仍可见）
        conds.push(sql`${platforms.stage} != 'closed'`);
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
          // 其余按综合评分排序，扶持期内新站加分获得冷启动曝光；
          // 故障站一律沉底——评分再高也不优先展示
          const ads = result
            .filter((r) => r.adActive)
            .sort((a, b) => b.adWeight - a.adWeight || Number(b.score) - Number(a.score))
            .slice(0, AD_PIN_LIMIT);
          const adIds = new Set(ads.map((a) => a.id));
          const adjScore = (r: (typeof result)[number]) =>
            Number(r.score) + (ageDays(r) <= NEW_SITE_DAYS ? NEW_SITE_BOOST : 0);
          const rest = result.filter((r) => !adIds.has(r.id));
          const alive = rest
            .filter((r) => r.status !== "down")
            .sort((a, b) => adjScore(b) - adjScore(a) || b.visitCount - a.visitCount);
          const down = rest
            .filter((r) => r.status === "down")
            .sort((a, b) => adjScore(b) - adjScore(a));
          result = [...ads, ...alive, ...down];
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

  /** 记录访问并返回目标地址；source 标记广告位点击（ad-home / ad-list / ad-top 等） */
  visit: publicQuery
    .input(
      z.object({
        platformId: z.number(),
        source: z
          .enum(["ad-home", "ad-list", "ad-top", "ad-bottom", "ad-left", "ad-right", "ad-popup"])
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(platforms)
        .where(eq(platforms.id, input.platformId))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "站点不存在" });
      // 只有确实在广告期的位置才记录广告来源，防止刷量污染自然流量
      const pos = input.source?.replace(/^ad-/, "") ?? "";
      const validSource = input.source && (await hasLiveAd(db, p, pos)) ? input.source : null;
      await db.insert(visitLogs).values({
        platformId: p.id,
        userId: ctx.user?.id ?? null,
        source: validSource,
      });
      await db
        .update(platforms)
        .set({ visitCount: p.visitCount + 1 })
        .where(eq(platforms.id, p.id));
      return { url: p.url };
    }),

  /** 广告位曝光埋点（前端在广告卡片实际渲染时调用） */
  adImpression: publicQuery
    .input(
      z.object({
        platformId: z.number(),
        position: z.enum(["home", "list", "top", "bottom", "left", "right", "popup"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [p] = await db
        .select({ id: platforms.id, isAd: platforms.isAd, adExpireAt: platforms.adExpireAt })
        .from(platforms)
        .where(eq(platforms.id, input.platformId))
        .limit(1);
      // 只记录确实在广告期的位置，其他直接忽略
      if (!p || !(await hasLiveAd(db, p, input.position))) return { recorded: false };
      await db.insert(adImpressions).values({
        platformId: p.id,
        position: input.position,
        userId: ctx.user?.id ?? null,
      });
      return { recorded: true };
    }),

  /** 招商页公开数据：站点规模 + 各广告位 7 天曝光/点击/占用 */
  adPublicStats: publicQuery.query(async () => {
    const db = getDb();
    const since7 = new Date(Date.now() - 7 * 86400_000);

    const [platCount] = await db.select({ n: sql<number>`count(*)` }).from(platforms);
    const [visitCount] = await db
      .select({ n: sql<number>`count(*)` })
      .from(visitLogs)
      .where(sql`${visitLogs.createdAt} >= ${since7}`);
    const [userCount] = await db.select({ n: sql<number>`count(*)` }).from(users);

    // 内置位（首页/列表）占用
    const liveAds = await db
      .select({ n: sql<number>`count(*)` })
      .from(platforms)
      .where(
        and(
          eq(platforms.isAd, true),
          or(sql`${platforms.adExpireAt} IS NULL`, sql`${platforms.adExpireAt} > NOW()`),
        ),
      );
    const builtInOccupied = Number(liveAds[0]?.n ?? 0);

    // 区域位占用
    const campRows = await db
      .select({ position: adCampaigns.position, n: sql<number>`count(*)` })
      .from(adCampaigns)
      .where(or(sql`${adCampaigns.expireAt} IS NULL`, sql`${adCampaigns.expireAt} > NOW()`))
      .groupBy(adCampaigns.position);
    const campByPos = new Map(campRows.map((r) => [r.position, Number(r.n)]));

    // 各位置 7 天曝光与点击
    const imps = await db
      .select({ position: adImpressions.position, n: sql<number>`count(*)` })
      .from(adImpressions)
      .where(sql`${adImpressions.createdAt} >= ${since7}`)
      .groupBy(adImpressions.position);
    const impByPos = new Map(imps.map((r) => [r.position, Number(r.n)]));
    const clks = await db
      .select({ source: visitLogs.source, n: sql<number>`count(*)` })
      .from(visitLogs)
      .where(and(sql`${visitLogs.createdAt} >= ${since7}`, sql`${visitLogs.source} IS NOT NULL`))
      .groupBy(visitLogs.source);
    const clkByPos = new Map(clks.map((r) => [String(r.source).replace(/^ad-/, ""), Number(r.n)]));

    const zones = (["home", "list", ...ZONE_POSITIONS] as const).map((pos) => ({
      position: pos,
      capacity: pos === "home" || pos === "list" ? 3 : ZONE_LIMIT[pos],
      occupied:
        pos === "home" || pos === "list"
          ? Math.min(builtInOccupied, 3)
          : campByPos.get(pos) ?? 0,
      imp7: impByPos.get(pos) ?? 0,
      clk7: clkByPos.get(pos) ?? 0,
    }));

    return {
      platforms: Number(platCount?.n ?? 0),
      users: Number(userCount?.n ?? 0),
      visits7d: Number(visitCount?.n ?? 0),
      zones,
    };
  }),

  /** 招商页：广告合作申请 */
  submitAdInquiry: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(120),
        contact: z.string().min(3).max(200),
        positions: z
          .array(z.enum(["home", "list", "top", "bottom", "left", "right", "popup"]))
          .min(1)
          .max(7),
        message: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb().insert(adInquiries).values({
        name: input.name,
        contact: input.contact,
        positions: input.positions,
        message: input.message ?? "",
      });
      return { success: true };
    }),

  zoneAds: publicQuery
    .input(z.object({ position: z.enum(["top", "bottom", "left", "right", "popup"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({ campaign: adCampaigns, platform: platforms })
        .from(adCampaigns)
        .innerJoin(platforms, eq(adCampaigns.platformId, platforms.id))
        .where(
          and(
            eq(adCampaigns.position, input.position),
            or(sql`${adCampaigns.expireAt} IS NULL`, sql`${adCampaigns.expireAt} > NOW()`),
            sql`${platforms.status} != 'down'`,
            sql`${platforms.stage} != 'closed'`,
          ),
        )
        .orderBy(desc(adCampaigns.weight), desc(platforms.score))
        .limit(ZONE_LIMIT[input.position]);
      return rows.map((r) => ({
        campaignId: r.campaign.id,
        id: r.platform.id,
        name: r.platform.name,
        domain: r.platform.domain,
        url: r.platform.url,
        description: r.platform.description,
        vendors: r.platform.vendors,
        status: r.platform.status,
      }));
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
