import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
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
});
