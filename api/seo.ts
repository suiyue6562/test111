import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { desc, eq, ne, and, sql } from "drizzle-orm";
import { platforms } from "@db/schema";
import { getDb } from "./queries/connection";

/**
 * SEO 模块（面向百度/Google 收录）：
 * 1. GET /robots.txt — 放行所有蜘蛛并声明 sitemap
 * 2. GET /sitemap.xml — 从 DB 动态生成（全部站点详情页 + 静态页），内存缓存 1 小时
 * 3. 搜索引擎 UA 预渲染 — 对 Baiduspider/Googlebot 等直接输出带完整 meta 与正文快照的 HTML，
 *    绕开 SPA 对百度不友好的问题；真实用户仍走正常 SPA。
 */

const SITE = "https://apibuy.top";
const BRAND = "API 观察者";
const SLOGAN = "找 API 中转站，先看 API 观察者。";

const BOT_RE =
  /Baiduspider|Googlebot|bingbot|360Spider|Sogou|YisouSpider|Bytespider|PetalBot|DuckDuckBot|Slurp|facebookexternalhit|Twitterbot|LinkedInBot/i;

type App = Hono<{ Bindings: HttpBindings }>;

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function htmlPage(p: {
  title: string;
  desc: string;
  keywords?: string;
  path: string;
  body: string;
}) {
  const canonical = `${SITE}${p.path}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}" />
${p.keywords ? `<meta name="keywords" content="${esc(p.keywords)}" />` : ""}
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${BRAND}" />
<meta property="og:title" content="${esc(p.title)}" />
<meta property="og:description" content="${esc(p.desc)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="robots" content="index,follow" />
</head>
<body>
${p.body}
<noscript><p>${esc(SLOGAN)} 本站为单页应用，建议开启 JavaScript 获得完整体验。</p></noscript>
</body>
</html>`;
}

function header(path: string, h1: string, sub: string) {
  return `<header>
<h1>${esc(h1)}</h1>
<p>${esc(sub)}</p>
<nav>
<a href="${SITE}/">首页</a> · <a href="${SITE}/pricing">价格对比</a> · <a href="${SITE}/leaderboard">排行榜</a> · <a href="${SITE}/discover">收录雷达</a> · <a href="${SITE}/forum">观察室</a>
</nav>
<link rel="canonical" data-path="${esc(path)}" />
</header><hr/>`;
}

export function registerSeo(app: App) {
  // ---------- robots.txt ----------
  app.get("/robots.txt", (c) => {
    return c.text(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\n\nSitemap: ${SITE}/sitemap.xml\n`,
      200,
      { "Content-Type": "text/plain; charset=utf-8" },
    );
  });

  // ---------- sitemap.xml（1 小时缓存） ----------
  let sitemapCache: { at: number; xml: string } | null = null;
  app.get("/sitemap.xml", async (c) => {
    if (sitemapCache && Date.now() - sitemapCache.at < 3600_000) {
      return c.text(sitemapCache.xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
    }
    const db = getDb();
    const rows = await db
      .select({ domain: platforms.domain, updatedAt: platforms.updatedAt })
      .from(platforms)
      .where(ne(platforms.status, "closed"));
    const staticPages: { path: string; priority: string; changefreq: string }[] = [
      { path: "/", priority: "1.0", changefreq: "daily" },
      { path: "/pricing", priority: "0.9", changefreq: "hourly" },
      { path: "/leaderboard", priority: "0.9", changefreq: "hourly" },
      { path: "/discover", priority: "0.8", changefreq: "hourly" },
      { path: "/forum", priority: "0.7", changefreq: "hourly" },
      { path: "/guide", priority: "0.6", changefreq: "weekly" },
      { path: "/sks", priority: "0.6", changefreq: "weekly" },
      { path: "/about", priority: "0.5", changefreq: "monthly" },
      { path: "/advertise", priority: "0.5", changefreq: "monthly" },
    ];
    const total = await db
      .select({ n: sql<number>`count(*)` })
      .from(platforms)
      .where(ne(platforms.status, "closed"));
    const totalCount = Number(total[0]?.n ?? 0);
    const today = new Date().toISOString().slice(0, 10);
    const urls: string[] = [];
    for (const p of staticPages) {
      urls.push(
        `<url><loc>${SITE}${esc(p.path)}</loc><lastmod>${today}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`,
      );
    }
    for (const r of rows) {
      const lm = r.updatedAt ? new Date(r.updatedAt).toISOString().slice(0, 10) : today;
      urls.push(
        `<url><loc>${SITE}/site/${encodeURIComponent(r.domain)}</loc><lastmod>${lm}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      );
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
    sitemapCache = { at: Date.now(), xml };
    return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
  });

  // ---------- 搜索引擎 UA 预渲染 ----------
  const isBot = (ua: string) => BOT_RE.test(ua);

  app.get("/", async (c, next) => {
    if (!isBot(c.req.header("user-agent") ?? "")) return await next(); // 交由 SPA
    const db = getDb();
    const top = await db
      .select({
        name: platforms.name,
        domain: platforms.domain,
        score: platforms.score,
        status: platforms.status,
      })
      .from(platforms)
      .where(and(ne(platforms.status, "down"), ne(platforms.status, "closed")))
      .orderBy(desc(platforms.score))
      .limit(80);
    const items = top
      .map(
        (p) =>
          `<li><a href="${SITE}/site/${encodeURIComponent(p.domain)}">${esc(p.name)}</a>（${esc(p.domain)}，评分 ${esc(Number(p.score).toFixed(1))}）</li>`,
      )
      .join("\n");
    const cnt = await db
      .select({ n: sql<number>`count(*)` })
      .from(platforms)
      .where(ne(platforms.status, "closed"));
    const totalCount = Number(cnt[0]?.n ?? 0);
    return c.html(
      htmlPage({
        title: `${BRAND} - ${SLOGAN}`,
        desc: `${SLOGAN}${BRAND}持续实测 ${totalCount} 家 API 中转站的稳定性、速度、价格与口碑，AI 打分横向对比，帮你找到最靠谱的 API 中转站。`,
        keywords: "API中转站,API中转,API转发,中转站评测,API中转站推荐,API中转站排行榜, Claude API中转, GPT API中转",
        path: "/",
        body: `${header("/", `${BRAND} - API 中转站评测与推荐平台`, SLOGAN)}
<main>
<p>${esc(SLOGAN)} 我们持续观察每一家 API 中转站：哪家最近掉线了、哪家涨价了、哪家新上了功能，一项一项帮你盯紧。不吹不黑，只说真话。</p>
<h2>优质 API 中转站推荐（AI 实测评分排序）</h2>
<ul>
${items}
</ul>
<p>查看完整榜单与价格对比请访问 <a href="${SITE}/leaderboard">${SITE}/leaderboard</a></p>
</main>`,
      }),
    );
  });

  app.get("/site/:domain", async (c, next) => {
    if (!isBot(c.req.header("user-agent") ?? "")) return await next();
    const domain = c.req.param("domain");
    const db = getDb();
    const [p] = await db.select().from(platforms).where(eq(platforms.domain, domain)).limit(1);
    if (!p) return await next();
    const tags = ((p.aiTags as string[] | null) ?? []).join("、");
    const statusText =
      p.status === "operational" ? "运行正常" : p.status === "down" ? "当前不可达" : "状态待确认";
    const desc = `${p.name}（${p.domain}）是一家 API 中转站，当前状态：${statusText}，AI 综合评分 ${Number(p.score).toFixed(1)}。${p.description ? String(p.description).slice(0, 80) : ""} 在${BRAND}查看${p.name}的实时价格、稳定性记录与用户评价。`;
    return c.html(
      htmlPage({
        title: `${p.name} 评测 - 价格、稳定性与用户口碑 | ${BRAND}`,
        desc,
        keywords: `${p.name},${p.domain},API中转站,${tags}`,
        path: `/site/${domain}`,
        body: `${header(`/site/${domain}`, `${p.name}（${p.domain}）中转站评测`, statusText)}
<main>
<p>官网：<a href="${esc(p.url)}" rel="nofollow">${esc(p.url)}</a></p>
<p>AI 综合评分：<strong>${esc(Number(p.score).toFixed(1))}</strong> ｜ 状态：${esc(statusText)} ｜ 收录编号：${p.id}</p>
${p.description ? `<p>${esc(p.description)}</p>` : ""}
${tags ? `<p>服务亮点：${esc(tags)}</p>` : ""}
<p>查看 <a href="${SITE}/site/${encodeURIComponent(domain)}">完整价格表与可用率曲线</a>，或与<a href="${SITE}/">其他中转站横向对比</a>。</p>
</main>`,
      }),
    );
  });

  // 静态页（价格页 / 排行榜 / 收录雷达 / 观察室 / 指南）
  const staticSeo: Record<string, { title: string; desc: string; keywords: string; h1: string; sub: string; body: string }> = {
    "/pricing": {
      title: `API 中转站价格对比 - 各站模型价格表 | ${BRAND}`,
      desc: `${SLOGAN}按模型分组对比上百家 API 中转站的实时价格：Claude、GPT、Gemini、DeepSeek 等主流模型在哪个中转站最便宜，价格变动每日追踪。`,
      keywords: "API中转站价格,中转站价格对比,Claude API价格,GPT API价格,API中转优惠",
      h1: "API 中转站价格对比",
      sub: "按模型分组的实时价格表，涨价降价一目了然",
      body: `<p>覆盖 Claude、GPT、Gemini、DeepSeek、GLM、Kimi 等主流模型的分组价格，数据每日自动采集并核对官网。</p><p>筛选与排序请访问 <a href="${SITE}/pricing">价格对比页</a>。</p>`,
    },
    "/leaderboard": {
      title: `API 中转站排行榜 - AI 实测评分 | ${BRAND}`,
      desc: `${SLOGAN}排行榜由 AI 推荐分与实测数据（可用率、延迟、价格）共同排序，广告主仅影响加权位，真实可信。`,
      keywords: "API中转站排行榜,中转站推荐,中转站排名",
      h1: "API 中转站排行榜",
      sub: "AI 推荐 + 实测数据双逻辑排序",
      body: `<p>按模型查看各中转站排名、倍率价、可用率与价格趋势。</p>`,
    },
    "/discover": {
      title: `收录雷达 - 最新收录 API 中转站 | ${BRAND}`,
      desc: `${SLOGAN}收录雷达持续发现并核验新上线的 API 中转站，每家都经 AI 实测后才展示推荐理由。`,
      keywords: "API中转站收录,新中转站,中转站雷达",
      h1: "收录雷达",
      sub: "持续发现新的 API 中转站",
      body: `<p>新站收录附 AI 推荐理由与实测记录。</p>`,
    },
    "/forum": {
      title: `观察室 - API 中转站讨论与爆料 | ${BRAND}`,
      desc: `${SLOGAN}观察室汇聚用户对各家 API 中转站的真实反馈：跑路预警、涨价爆料、使用体验。`,
      keywords: "中转站跑路,中转站爆料,API中转讨论",
      h1: "观察室",
      sub: "用户真实反馈与行业动态",
      body: `<p>欢迎分享你对各家中转站的观察。</p>`,
    },
    "/guide": {
      title: `API 中转站新手指南 | ${BRAND}`,
      desc: `${SLOGAN}什么是 API 中转站、如何选择靠谱中转站、倍率计费等基础知识科普。`,
      keywords: "API中转站是什么,中转站教程,中转站科普",
      h1: "新手指南",
      sub: "API 中转站基础知识",
      body: `<p>从入门到避坑的完整指南。</p>`,
    },
    "/sks": {
      title: `API 检测 - 检测任意站点是否为 API 中转站 | ${BRAND}`,
      desc: `${SLOGAN}输入任意网址，AI 自动检测该站点是否为 API 中转站并分析其服务亮点与价格。`,
      keywords: "API检测,中转站检测,站点识别",
      h1: "API 检测",
      sub: "AI 识别任意站点的中转站属性",
      body: `<p>输入网址即可检测。</p>`,
    },
  };
  for (const [path, cfg] of Object.entries(staticSeo)) {
    app.get(path, async (c, next) => {
      if (!isBot(c.req.header("user-agent") ?? "")) return await next();
      return c.html(
        htmlPage({
          title: cfg.title,
          desc: cfg.desc,
          keywords: cfg.keywords,
          path,
          body: `${header(path, cfg.h1, cfg.sub)}<main>${cfg.body}</main>`,
        }),
      );
    });
  }
}
