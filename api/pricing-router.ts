import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { platforms, platformPrices, platformDailyStatus } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery } from "./middleware";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export const pricingRouter = createRouter({
  /** 可选模型目录 */
  catalog: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ vendor: platformPrices.vendor, model: platformPrices.model })
      .from(platformPrices);
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const arr = map.get(r.vendor) ?? [];
      arr.push(r.model);
      map.set(r.vendor, arr);
    }
    return Array.from(map.entries()).map(([vendor, models]) => ({
      vendor,
      models: models.sort(),
    }));
  }),

  /** 价格表：按模型聚合各站点价格 */
  table: publicQuery
    .input(
      z.object({
        vendor: z.string(),
        model: z.string(),
        groupName: z.string().default("default"),
        sort: z.enum(["ratioAsc", "ratioDesc", "latencyAsc", "uptimeDesc"]).default("ratioAsc"),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const prices = await db
        .select()
        .from(platformPrices)
        .where(
          and(
            eq(platformPrices.vendor, input.vendor),
            eq(platformPrices.model, input.model),
            eq(platformPrices.groupName, input.groupName),
          ),
        );
      if (prices.length === 0) return { total: 0, items: [] };
      const plats = await db
        .select()
        .from(platforms)
        .where(inArray(platforms.id, prices.map((p) => p.platformId)));
      const since = new Date();
      since.setDate(since.getDate() - 29);
      const sinceStr = `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`;
      const stats = await db
        .select()
        .from(platformDailyStatus)
        .where(inArray(platformDailyStatus.platformId, plats.map((p) => p.id)));
      const items = prices.map((pr) => {
        const plat = plats.find((p) => p.id === pr.platformId);
        const days = stats.filter(
          (s) => s.platformId === pr.platformId && s.date >= sinceStr && s.status !== "nodata",
        );
        const ok = days.filter((d) => d.status === "ok").length;
        const uptime = days.length > 0 ? (ok / days.length) * 100 : null;
        const lat = days.filter((d) => d.latencyMs != null);
        const avgLatency =
          lat.length > 0
            ? Math.round(lat.reduce((a, b) => a + (b.latencyMs ?? 0), 0) / lat.length)
            : null;
        return {
          priceId: pr.id,
          platformId: pr.platformId,
          name: plat?.name ?? "未知",
          domain: plat?.domain ?? "",
          url: plat?.url ?? "",
          ratio: pr.ratio,
          shortCost: pr.shortCost,
          longCost: pr.longCost,
          uptime,
          avgLatency,
        };
      });
      switch (input.sort) {
        case "ratioDesc":
          items.sort((a, b) => Number(b.ratio) - Number(a.ratio));
          break;
        case "latencyAsc":
          items.sort((a, b) => (a.avgLatency ?? Infinity) - (b.avgLatency ?? Infinity));
          break;
        case "uptimeDesc":
          items.sort((a, b) => (b.uptime ?? -1) - (a.uptime ?? -1));
          break;
        default:
          items.sort((a, b) => Number(a.ratio) - Number(b.ratio));
      }
      return { total: items.length, items };
    }),

  /** 站点全部价格 */
  forPlatform: publicQuery
    .input(z.object({ platformId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(platformPrices)
        .where(eq(platformPrices.platformId, input.platformId))
        .orderBy(asc(platformPrices.vendor), asc(platformPrices.model));
    }),

  /**
   * 热门模型全网最低价榜单：按在售站数取热门模型，找出每个模型的最低价站点
   */
  lowestBoard: publicQuery.query(async () => {
    const db = getDb();
    // 热门模型：在售站点最多的前 30 个
    const hot = await db
      .select({
        model: platformPrices.model,
        vendor: platformPrices.vendor,
        sellers: sql<number>`count(distinct ${platformPrices.platformId})`,
      })
      .from(platformPrices)
      .groupBy(platformPrices.model, platformPrices.vendor)
      .orderBy(desc(sql`count(distinct ${platformPrices.platformId})`))
      .limit(30);
    if (hot.length === 0) return [];
    const rows = await db
      .select({
        platformId: platformPrices.platformId,
        model: platformPrices.model,
        ratio: platformPrices.ratio,
        shortCost: platformPrices.shortCost,
      })
      .from(platformPrices)
      .where(inArray(platformPrices.model, hot.map((h) => h.model)));
    const plats = await db
      .select({ id: platforms.id, name: platforms.name, domain: platforms.domain, status: platforms.status })
      .from(platforms)
      .where(inArray(platforms.id, [...new Set(rows.map((r) => r.platformId))]));
    const platOf = new Map(plats.map((p) => [p.id, p]));
    const eff = (r: { ratio: string; shortCost: string }) => {
      const ratio = Number(r.ratio);
      return ratio > 0 ? ratio : Number(r.shortCost) || Infinity;
    };
    return hot
      .map((h) => {
        // 按平台去重取最低，剔除故障站
        const byPlat = new Map<number, number>();
        for (const r of rows) {
          if (r.model !== h.model) continue;
          const plat = platOf.get(r.platformId);
          if (!plat || plat.status === "down") continue;
          const e = eff(r);
          byPlat.set(r.platformId, Math.min(byPlat.get(r.platformId) ?? Infinity, e));
        }
        const sorted = [...byPlat.entries()].sort((a, b) => a[1] - b[1]);
        if (sorted.length === 0) return null;
        const [minPid, minEff] = sorted[0];
        const minPlat = platOf.get(minPid)!;
        const secondEff = sorted[1]?.[1] ?? null;
        return {
          vendor: h.vendor,
          model: h.model,
          sellers: sorted.length,
          minEff,
          isRatio: minEff !== Infinity,
          minPlatformId: minPlat.id,
          minPlatformName: minPlat.name,
          minDomain: minPlat.domain,
          // 比次低便宜的百分比（无次低则 null）
          cheaperThanSecond:
            secondEff != null && secondEff > 0 && minEff !== Infinity
              ? Math.round(((secondEff - minEff) / secondEff) * 100)
              : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }),

  /**
   * 同站比价：该站每个模型在全网的价格排名
   * 返回 { [model]: { rank, total, minPlatformName, minDomain, minEff, myEff, isRatio } }
   * eff：有效价格，倍率>0 用倍率，按次计费（倍率=0）用短文花费
   */
  modelCompare: publicQuery
    .input(z.object({ platformId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const mine = await db
        .select()
        .from(platformPrices)
        .where(eq(platformPrices.platformId, input.platformId));
      if (mine.length === 0) return {};
      const models = [...new Set(mine.map((m) => m.model))];
      const all = await db
        .select({
          platformId: platformPrices.platformId,
          model: platformPrices.model,
          ratio: platformPrices.ratio,
          shortCost: platformPrices.shortCost,
        })
        .from(platformPrices)
        .where(inArray(platformPrices.model, models));
      const sellerIds = [...new Set(all.map((a) => a.platformId))];
      const plats = await db
        .select({ id: platforms.id, name: platforms.name, domain: platforms.domain, status: platforms.status })
        .from(platforms)
        .where(inArray(platforms.id, sellerIds));
      const platOf = new Map(plats.map((p) => [p.id, p]));

      const eff = (r: { ratio: string; shortCost: string }) => {
        const ratio = Number(r.ratio);
        return ratio > 0 ? ratio : Number(r.shortCost) || Infinity;
      };
      // 每个模型：按平台去重（取该平台最低有效价），过滤已关闭站
      const byModel = new Map<string, { platformId: number; eff: number }[]>();
      for (const r of all) {
        const plat = platOf.get(r.platformId);
        if (!plat || plat.status === "down") continue;
        const arr = byModel.get(r.model) ?? [];
        const existing = arr.find((x) => x.platformId === r.platformId);
        const e = eff(r);
        if (existing) existing.eff = Math.min(existing.eff, e);
        else arr.push({ platformId: r.platformId, eff: e });
        byModel.set(r.model, arr);
      }

      const result: Record<
        string,
        { rank: number; total: number; minPlatformName: string; minDomain: string; minEff: number; myEff: number; isRatio: boolean }
      > = {};
      for (const m of mine) {
        const sellers = byModel.get(m.model) ?? [];
        if (sellers.length < 2) continue; // 全网只有一家卖，无比价意义
        const myEff = eff(m);
        const cheaper = sellers.filter((s) => s.platformId !== input.platformId && s.eff < myEff - 1e-9).length;
        const minSeller = sellers.reduce((a, b) => (b.eff < a.eff ? b : a));
        const minPlat = platOf.get(minSeller.platformId);
        result[m.model] = {
          rank: cheaper + 1,
          total: sellers.length,
          minPlatformName: minPlat?.name ?? "",
          minDomain: minPlat?.domain ?? "",
          minEff: minSeller.eff,
          myEff,
          isRatio: Number(m.ratio) > 0,
        };
      }
      return result;
    }),
});
