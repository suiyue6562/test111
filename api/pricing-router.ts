import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { platforms, platformPrices, platformDailyStatus } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery } from "./middleware";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 模型名归一化：去掉供应商前缀(openai/)、日期后缀(-20250929)、:batch 等变体标记，
 * 再按白名单识别为规范名（如 GPT-5、Claude Sonnet 4.5）。
 * 返回 null 表示非主流通用模型（站点自造名/图像音频等），不进价格页目录与榜单。
 */
function canonicalModel(raw: string): { label: string; family: string } | null {
  let s = raw.toLowerCase().trim();
  s = s.replace(/^[a-z0-9_.-]+\//, ""); // 供应商前缀
  s = s.replace(/:.*$/, ""); // :batch / :free
  s = s.replace(/-20\d{2}-?\d{2}-?\d{2}$/, ""); // 日期后缀
  s = s.replace(/-(latest|preview|beta|exp|stable)$/, "");
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^gpt-(5(?:\.\d+)?|4o|4\.1)(-mini|-nano|-pro)?$/))) {
    return { label: `GPT-${m[1]}${m[2] ? m[2].replace("-", " ") : ""}`, family: "OpenAI" };
  }
  if ((m = s.match(/^o[34](-mini|-pro)?$/))) {
    return { label: m[0].replace("-mini", " mini").replace("-pro", " pro"), family: "OpenAI" };
  }
  if ((m = s.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:[.-](\d+))?$/))) {
    const kind = m[1][0].toUpperCase() + m[1].slice(1);
    const ver = m[3] ? `${m[2]}.${m[3]}` : m[2];
    return { label: `Claude ${kind} ${ver}`, family: "Claude" };
  }
  if ((m = s.match(/^claude-3[.-]([57])-(opus|sonnet|haiku)$/))) {
    const kind = m[2][0].toUpperCase() + m[2].slice(1);
    return { label: `Claude 3.${m[1]} ${kind}`, family: "Claude" };
  }
  if ((m = s.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash)(-lite)?$/))) {
    return { label: `Gemini ${m[1]} ${m[2][0].toUpperCase() + m[2].slice(1)}${m[3] ? " Lite" : ""}`, family: "Gemini" };
  }
  if ((m = s.match(/^deepseek-(chat|reasoner)$/))) {
    return { label: m[1] === "chat" ? "DeepSeek V3" : "DeepSeek R1", family: "DeepSeek" };
  }
  if ((m = s.match(/^deepseek-(v3|r1)(\.\d+)?$/))) {
    return { label: `DeepSeek ${m[1].toUpperCase()}`, family: "DeepSeek" };
  }
  if ((m = s.match(/^qwen3?-(max|plus|turbo|flash)$/)) || (m = s.match(/^qwen-(max|plus|turbo)$/))) {
    const v = s.startsWith("qwen3") ? "Qwen3" : "Qwen";
    const tier = m[1][0].toUpperCase() + m[1].slice(1);
    return { label: `${v} ${tier}`, family: "Qwen" };
  }
  if (/^kimi-k2/.test(s)) return { label: "Kimi K2", family: "Kimi" };
  if ((m = s.match(/^glm-(\d+(?:\.\d+)?)(-air|-flash|-plus)?$/))) {
    return { label: `GLM-${m[1]}${m[2] ? m[2].replace("-", " ") : ""}`, family: "GLM" };
  }
  if ((m = s.match(/^grok-(\d+(?:\.\d+)?)(-mini|-fast|-heavy)?$/))) {
    return { label: `Grok ${m[1]}${m[2] ? m[2].replace("-", " ") : ""}`, family: "xAI" };
  }
  return null;
}

export const pricingRouter = createRouter({
  /** 规范模型目录：canonical 白名单模型，含原始型号变体与真实可用价格组 */
  catalog: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ model: platformPrices.model, groupName: platformPrices.groupName })
      .from(platformPrices);
    const byLabel = new Map<string, { label: string; family: string; variants: Set<string>; groups: Set<string> }>();
    for (const r of rows) {
      const c = canonicalModel(r.model);
      if (!c) continue;
      const e = byLabel.get(c.label) ?? { label: c.label, family: c.family, variants: new Set(), groups: new Set() };
      e.variants.add(r.model);
      e.groups.add(r.groupName);
      byLabel.set(c.label, e);
    }
    const families = new Map<string, { label: string; variants: string[]; groups: string[] }[]>();
    for (const e of byLabel.values()) {
      const arr = families.get(e.family) ?? [];
      arr.push({
        label: e.label,
        variants: [...e.variants],
        groups: [...e.groups].sort((a, b) => (a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b))),
      });
      families.set(e.family, arr);
    }
    const FAMILY_ORDER = ["OpenAI", "Claude", "Gemini", "DeepSeek", "Qwen", "Kimi", "GLM", "xAI"];
    return [...families.entries()]
      .sort((a, b) => (FAMILY_ORDER.indexOf(a[0]) + 99) - (FAMILY_ORDER.indexOf(b[0]) + 99))
      .map(([vendor, models]) => ({ vendor, models: models.sort((a, b) => a.label.localeCompare(b.label)) }));
  }),

  /** 价格表：canonical 模型（label）→ 全部原始型号变体，按模型聚合各站点价格 */
  table: publicQuery
    .input(
      z.object({
        vendor: z.string(),
        model: z.string(), // canonical label
        groupName: z.string().default("default"),
        sort: z.enum(["ratioAsc", "ratioDesc", "latencyAsc", "uptimeDesc"]).default("ratioAsc"),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const distinct = await db.selectDistinct({ model: platformPrices.model }).from(platformPrices);
      const variants = distinct.map((d) => d.model).filter((m) => canonicalModel(m)?.label === input.model);
      if (variants.length === 0) return { total: 0, items: [] };
      const prices = await db
        .select()
        .from(platformPrices)
        .where(and(inArray(platformPrices.model, variants), eq(platformPrices.groupName, input.groupName)));
      if (prices.length === 0) return { total: 0, items: [] };
      // 有效价：倍率>0 用倍率；按次计费（倍率=0）用短文花费；每平台取最低
      const effOf = (r: { ratio: string; shortCost: string }) => {
        const ratio = Number(r.ratio);
        if (ratio > 0) return { e: ratio, isRatio: true };
        const c = Number(r.shortCost);
        return c > 0 ? { e: c, isRatio: false } : null;
      };
      const bestByPlat = new Map<number, { row: (typeof prices)[number]; e: number; isRatio: boolean }>();
      for (const r of prices) {
        const v = effOf(r);
        if (!v) continue;
        const cur = bestByPlat.get(r.platformId);
        if (!cur || v.e < cur.e) bestByPlat.set(r.platformId, { row: r, ...v });
      }
      const plats = await db
        .select()
        .from(platforms)
        .where(inArray(platforms.id, [...bestByPlat.keys()]));
      const since = new Date();
      since.setDate(since.getDate() - 29);
      const sinceStr = `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`;
      const stats = await db
        .select()
        .from(platformDailyStatus)
        .where(inArray(platformDailyStatus.platformId, plats.map((p) => p.id)));
      const items = [...bestByPlat.values()].map(({ row: pr, e, isRatio }) => {
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
          variant: pr.model,
          eff: e,
          isRatio,
          ratio: pr.ratio,
          shortCost: pr.shortCost,
          longCost: pr.longCost,
          collectedAt: pr.collectedAt,
          uptime,
          avgLatency,
        };
      });
      switch (input.sort) {
        case "ratioDesc":
          items.sort((a, b) => b.eff - a.eff);
          break;
        case "latencyAsc":
          items.sort((a, b) => (a.avgLatency ?? Infinity) - (b.avgLatency ?? Infinity));
          break;
        case "uptimeDesc":
          items.sort((a, b) => (b.uptime ?? -1) - (a.uptime ?? -1));
          break;
        default:
          items.sort((a, b) => a.eff - b.eff);
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
   * 热门模型全网最低价榜单：canonical 白名单模型，按在售站数排序，找每模型最低价站点
   * 倍率与按次花费不混排：只有同一单位才计算「比次低便宜」
   */
  lowestBoard: publicQuery.query(async () => {
    const db = getDb();
    const all = await db
      .select({
        platformId: platformPrices.platformId,
        model: platformPrices.model,
        ratio: platformPrices.ratio,
        shortCost: platformPrices.shortCost,
      })
      .from(platformPrices);
    const plats = await db
      .select({ id: platforms.id, name: platforms.name, domain: platforms.domain, status: platforms.status })
      .from(platforms)
      .where(inArray(platforms.id, [...new Set(all.map((r) => r.platformId))]));
    const platOf = new Map(plats.map((p) => [p.id, p]));
    // canonical 聚合：label → { family, platformId → 最低有效价 }
    const byLabel = new Map<string, { family: string; pm: Map<number, { e: number; isRatio: boolean }> }>();
    for (const r of all) {
      const c = canonicalModel(r.model);
      if (!c) continue;
      const plat = platOf.get(r.platformId);
      if (!plat || plat.status === "down" || plat.stage === "closed") continue;
      const ratio = Number(r.ratio);
      const cost = Number(r.shortCost);
      const v = ratio > 0 ? { e: ratio, isRatio: true } : cost > 0 ? { e: cost, isRatio: false } : null;
      if (!v) continue;
      const e0 = byLabel.get(c.label) ?? { family: c.family, pm: new Map() };
      const cur = e0.pm.get(r.platformId);
      if (!cur || v.e < cur.e) e0.pm.set(r.platformId, v);
      byLabel.set(c.label, e0);
    }
    // 热门度 = 在售站数，取前 30
    const hot = [...byLabel.entries()]
      .map(([label, e0]) => ({ label, family: e0.family, pm: e0.pm, sellers: e0.pm.size }))
      .sort((a, b) => b.sellers - a.sellers)
      .slice(0, 30);
    return hot
      .map(({ label, family, pm, sellers }) => {
        // 同单位比较：倍率与按次分开取最低价，优先展示倍率
        const ratios = [...pm.entries()].filter(([, v]) => v.isRatio).sort((a, b) => a[1].e - b[1].e);
        const costs = [...pm.entries()].filter(([, v]) => !v.isRatio).sort((a, b) => a[1].e - b[1].e);
        const pick = ratios.length > 0 ? ratios : costs;
        if (pick.length === 0) return null;
        const [minPid, minV] = pick[0];
        const minPlat = platOf.get(minPid);
        if (!minPlat) return null;
        const second = pick[1]?.[1];
        return {
          vendor: family,
          model: label,
          sellers,
          minEff: minV.e,
          isRatio: minV.isRatio,
          minPlatformId: minPlat.id,
          minPlatformName: minPlat.name,
          minDomain: minPlat.domain,
          cheaperThanSecond:
            second && second.e > 0 ? Math.round(((second.e - minV.e) / second.e) * 100) : null,
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
        const sellers = (byModel.get(m.model) ?? []).filter((s) => s.eff !== Infinity);
        if (sellers.length < 2) continue; // 全网只有一家卖，无比价意义
        const myEff = eff(m);
        if (myEff === Infinity) continue; // 本站该模型无有效价格（如纯按次计费），不做对比
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
