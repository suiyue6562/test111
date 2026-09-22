#!/usr/bin/env node
/**
 * SK-Buy 采集器（常驻进程，PM2 管理）：
 *  1. 周期性探测每个平台的 {apiBaseUrl}/models，记录可用性与延迟，
 *     写入 platform_daily_status（当日按"最差状态"合并），并更新 platforms.status
 *  2. 每轮探测后重算综合评分 platforms.score：
 *     score = 30天可用率*35% + 用户评分*25% + 延迟得分*15% + 访问量得分*15% + 精选权重*10%
 *
 * 环境变量：
 *  PROBE_INTERVAL_MINUTES  探测间隔分钟数（默认 60）
 *  PROBE_TIMEOUT_MS        单次探测超时毫秒（默认 10000）
 */
require("dotenv/config");
const mysql = require("mysql2/promise");

const INTERVAL_MIN = parseInt(process.env.PROBE_INTERVAL_MINUTES || "60", 10);
const TIMEOUT_MS = parseInt(process.env.PROBE_TIMEOUT_MS || "10000", 10);
const PRICE_INTERVAL_HOURS = parseFloat(process.env.PRICE_INTERVAL_HOURS || "24");
const USD_CNY = parseFloat(process.env.USD_CNY_RATE || "7.2");

function pad(n) { return String(n).padStart(2, "0"); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 探测单个 API base：返回可达性、HTTP 状态、是否为真实 API（需鉴权或返回模型列表） */
async function probeBase(base) {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${base}/models`, { signal: ctrl.signal, redirect: "manual" });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    let apiConfirmed = res.status === 401 || res.status === 403;
    if (res.status === 200) {
      try {
        const j = await res.json();
        apiConfirmed = Array.isArray(j?.data);
      } catch {
        apiConfirmed = false;
      }
    }
    return { reachable: res.status < 500, status: res.status, latencyMs, apiConfirmed, base };
  } catch {
    return { reachable: false, status: 0, latencyMs: Date.now() - started, apiConfirmed: false, base };
  }
}

/** 探测平台：按 apiBaseUrl、站点根/v1 顺序尝试，404 时自动换路径 */
async function probe(platform) {
  const bases = [];
  const apiBase = (platform.apiBaseUrl || "").replace(/\/+$/, "");
  if (apiBase) bases.push(apiBase);
  const rootV1 = `${platform.url.replace(/\/+$/, "")}/v1`;
  if (!bases.includes(rootV1)) bases.push(rootV1);

  let last = null;
  for (const b of bases) {
    const r = await probeBase(b);
    last = r;
    if (r.status === 404) continue; // 路径不对，尝试下一个
    if (r.reachable) return r;
    if (r.status === 0) continue; // 网络失败，尝试下一个候选
  }
  return last ?? { reachable: false, status: 0, latencyMs: null, apiConfirmed: false, base: bases[0] ?? "" };
}

const WORST = { ok: 0, slow: 1, down: 2, nodata: -1 };

async function runOnce(pool) {
  const [plats] = await pool.query(
    "SELECT id, name, apiBaseUrl, url, status FROM platforms WHERE stage != 'closed'",
  );
  console.log(`[collector] ${new Date().toISOString()} 探测 ${plats.length} 个平台`);
  const date = todayStr();

  // 记录本轮探测运行
  const [runRes] = await pool.query(
    "INSERT INTO collector_runs (type, total) VALUES ('probe', ?)",
    [plats.length],
  );
  const runId = runRes.insertId;
  const tally = { ok: 0, slow: 0, down: 0, nodata: 0 };
  const latencies = [];

  // 10 路并发探测，避免大量平台时单轮耗时过长
  const CHUNK = 10;
  for (let i = 0; i < plats.length; i += CHUNK) {
    const batch = plats.slice(i, i + CHUNK);
    const results = await Promise.allSettled(batch.map((p) => probeOne(pool, p, date)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        tally[r.value.status] = (tally[r.value.status] ?? 0) + 1;
        if (r.value.latencyMs != null) latencies.push(r.value.latencyMs);
      }
    }
  }

  await recomputeScores(pool);

  const avgLat = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  await pool.query(
    "UPDATE collector_runs SET finishedAt = NOW(), okCount = ?, failCount = ?, detail = ? WHERE id = ?",
    [
      tally.ok,
      tally.down,
      `ok:${tally.ok} slow:${tally.slow} down:${tally.down} unknown:${tally.nodata}${avgLat != null ? ` avg:${avgLat}ms` : ""}`,
      runId,
    ],
  );
}

async function probeOne(pool, p, date) {
  try {
    const r = await probe(p);
    // 全部候选路径 404：站点在线但 API 中转能力未确认，记为 unknown
    const apiAlive = r.reachable && r.status !== 404;
    let dayStatus;
    if (!apiAlive) dayStatus = r.status === 404 ? "nodata" : "down";
    else if (r.latencyMs != null && r.latencyMs > 3000) dayStatus = "slow";
    else dayStatus = "ok";

    // 当日记录按"最差状态"合并，延迟取平均
    const [rows] = await pool.query(
      "SELECT status, latencyMs FROM platform_daily_status WHERE platformId = ? AND date = ?",
      [p.id, date],
    );
    let finalStatus = dayStatus;
    let finalLatency = r.latencyMs;
    if (rows.length > 0) {
      const prev = rows[0];
      if (WORST[prev.status] > WORST[dayStatus]) finalStatus = prev.status;
      if (prev.latencyMs != null && r.latencyMs != null) {
        finalLatency = Math.round((prev.latencyMs + r.latencyMs) / 2);
      } else if (prev.latencyMs != null) {
        finalLatency = prev.latencyMs;
      }
      await pool.query(
        "UPDATE platform_daily_status SET status = ?, latencyMs = ? WHERE platformId = ? AND date = ?",
        [finalStatus, finalLatency, p.id, date],
      );
    } else {
      await pool.query(
        "INSERT INTO platform_daily_status (platformId, date, status, latencyMs) VALUES (?, ?, ?, ?)",
        [p.id, date, finalStatus, finalLatency],
      );
    }

    // 平台总状态跟随最新探测（全部路径 404 → unknown，不纳入可用率统计）
    const newStatus =
      dayStatus === "nodata" ? "unknown" : !apiAlive ? "down" : r.latencyMs > 3000 ? "slow" : "operational";
    if (newStatus !== p.status) {
      await pool.query("UPDATE platforms SET status = ? WHERE id = ?", [newStatus, p.id]);
    }
    // 若在备选路径上确认了真实 API，自动纠正 apiBaseUrl
    if (r.apiConfirmed && r.base && r.base !== (p.apiBaseUrl || "").replace(/\/+$/, "")) {
      await pool.query("UPDATE platforms SET apiBaseUrl = ? WHERE id = ?", [r.base, p.id]);
      console.log(`[collector] ${p.name}: apiBaseUrl 自动纠正为 ${r.base}`);
    }
    console.log(
      `[collector] ${p.name}: ${apiAlive ? "可达" : r.status === 404 ? "API未确认" : "不可达"} ${r.latencyMs ?? "-"}ms${r.apiConfirmed ? " [API已确认]" : ""}`,
    );
    return { status: dayStatus, latencyMs: r.latencyMs };
  } catch (e) {
    console.error(`[collector] ${p.name} 探测异常:`, e.message);
    return { status: "down", latencyMs: null };
  }
}

async function recomputeScores(pool) {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceStr = `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`;

  const [plats] = await pool.query("SELECT id, featured, visitCount FROM platforms");
  const [daily] = await pool.query(
    "SELECT platformId, status, latencyMs FROM platform_daily_status WHERE date >= ?",
    [sinceStr],
  );
  const [ratings] = await pool.query(
    "SELECT platformId, AVG(rating) AS avgRating FROM reviews WHERE status = 'published' GROUP BY platformId",
  );

  const dailyByP = new Map();
  for (const d of daily) {
    if (!dailyByP.has(d.platformId)) dailyByP.set(d.platformId, []);
    dailyByP.get(d.platformId).push(d);
  }
  const ratingByP = new Map(ratings.map((r) => [r.platformId, Number(r.avgRating)]));
  const maxVisit = Math.max(1, ...plats.map((p) => p.visitCount));

  for (const p of plats) {
    const days = (dailyByP.get(p.id) || []).filter((d) => d.status !== "nodata");
    // 无监测数据时给中性分，避免新站被压到底部
    const uptime = days.length
      ? days.filter((d) => d.status === "ok").length / days.length
      : 0.5;
    const latRows = days.filter((d) => d.latencyMs != null);
    const avgLat = latRows.length
      ? latRows.reduce((a, b) => a + b.latencyMs, 0) / latRows.length
      : null;
    const latScore = avgLat == null ? 0.5 : Math.max(0, 1 - avgLat / 5000);
    const rating = ratingByP.get(p.id);
    const ratingScore = rating == null ? 0.5 : rating / 5;
    const visitScore = Math.log10(1 + p.visitCount) / Math.log10(1 + maxVisit);
    const manual = p.featured ? 1 : 0;

    const score =
      35 * uptime + 25 * ratingScore + 15 * latScore + 15 * visitScore + 10 * manual;
    await pool.query("UPDATE platforms SET score = ? WHERE id = ?", [
      score.toFixed(3),
      p.id,
    ]);
  }
  console.log(`[collector] 评分已重算（${plats.length} 个平台）`);
}

/* ---------------- 价格自动采集（one-api / new-api 公共接口） ---------------- */

const VENDOR_RULES = [
  [/^(gpt|o\d|chatgpt|openai)/i, "OpenAI"],
  [/^claude/i, "Claude"],
  [/^gemini/i, "Gemini"],
  [/^deepseek/i, "DeepSeek"],
  [/^(qwen|qwq|通义)/i, "Qwen"],
  [/^(kimi|moonshot)/i, "Kimi"],
  [/^(glm|chatglm|智谱)/i, "GLM"],
  [/^(minimax|abab)/i, "MiniMax"],
  [/^(grok|xai)/i, "xAI"],
];

function vendorOf(model) {
  for (const [re, v] of VENDOR_RULES) if (re.test(model)) return v;
  return "其他";
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SKBuyBot/1.0)" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseMaybeJson(v) {
  if (v == null) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return {}; }
}

/** 估算单次调用人民币花费：one-api 中 model_ratio=1 对应 $0.002/1K 输入 tokens */
function estimateCosts(modelRatio, completionRatio, groupRatio) {
  const per1kIn = 0.002 * modelRatio; // $ / 1K input tokens
  const cr = completionRatio > 0 ? completionRatio : 3;
  const short$ = per1kIn * (2 + 0.5 * cr); // 2K 输入 + 0.5K 输出
  const long$ = per1kIn * (8 + 2 * cr);    // 8K 输入 + 2K 输出
  return {
    shortCost: (short$ * USD_CNY * groupRatio).toFixed(4),
    longCost: (long$ * USD_CNY * groupRatio).toFixed(4),
  };
}

/** 从单个站点采集价格，返回 [{vendor, model, ratio, shortCost, longCost}] */
async function fetchPlatformPrices(platform) {
  const root = (platform.url || "").replace(/\/+$/, "");
  if (!root) return null;

  // 1) new-api：/api/pricing
  const pj = await fetchJson(`${root}/api/pricing`);
  if (pj && pj.success && Array.isArray(pj.data) && pj.data.length > 0) {
    const groupRatio = Number(parseMaybeJson(pj.group_ratio).default) || 1;
    const items = [];
    for (const m of pj.data) {
      const model = m.model_name || m.model;
      if (!model) continue;
      if (m.quota_type === 1 && Number(m.model_price) > 0) {
        // 按次计费：model_price 为 quota（$1 = 500000 quota）
        const cost = ((Number(m.model_price) / 500000) * USD_CNY * groupRatio).toFixed(4);
        items.push({ vendor: vendorOf(model), model, ratio: "0", shortCost: cost, longCost: cost });
      } else {
        const mr = Number(m.model_ratio);
        if (!(mr > 0 && mr < 10000)) continue;
        const eff = mr * groupRatio;
        const costs = estimateCosts(mr, Number(m.completion_ratio), groupRatio);
        items.push({ vendor: vendorOf(model), model, ratio: eff.toFixed(4), ...costs });
      }
      if (items.length >= 500) break;
    }
    if (items.length > 0) return items;
  }

  // 2) one-api 旧版：/api/ratio_config
  const rj = await fetchJson(`${root}/api/ratio_config`);
  if (rj && rj.success && rj.data) {
    const modelRatio = parseMaybeJson(rj.data.model_ratio);
    const completionRatio = parseMaybeJson(rj.data.completion_ratio);
    const groupRatio = Number(parseMaybeJson(rj.data.group_ratio).default) || 1;
    const items = [];
    for (const [model, mr0] of Object.entries(modelRatio)) {
      const mr = Number(mr0);
      if (!(mr > 0 && mr < 10000)) continue;
      const eff = mr * groupRatio;
      const costs = estimateCosts(mr, Number(completionRatio[model]), groupRatio);
      items.push({ vendor: vendorOf(model), model, ratio: eff.toFixed(4), ...costs });
      if (items.length >= 500) break;
    }
    if (items.length > 0) return items;
  }
  return null;
}

async function upsertPrices(pool, platformId, items) {
  const [existing] = await pool.query(
    "SELECT id, vendor, model, groupName, ratio, shortCost, longCost FROM platform_prices WHERE platformId = ?",
    [platformId],
  );
  const byKey = new Map(existing.map((r) => [`${r.vendor}|${r.model}|${r.groupName}`, r]));
  let inserted = 0, updated = 0;
  for (const it of items) {
    const key = `${it.vendor}|${it.model}|default`;
    const ex = byKey.get(key);
    if (!ex) {
      await pool.query(
        "INSERT INTO platform_prices (platformId, vendor, model, groupName, ratio, shortCost, longCost) VALUES (?, ?, ?, 'default', ?, ?, ?)",
        [platformId, it.vendor, it.model, it.ratio, it.shortCost, it.longCost],
      );
      inserted++;
    } else if (
      String(ex.ratio) !== String(it.ratio) ||
      String(ex.shortCost) !== String(it.shortCost) ||
      String(ex.longCost) !== String(it.longCost)
    ) {
      await pool.query(
        "UPDATE platform_prices SET ratio = ?, shortCost = ?, longCost = ? WHERE id = ?",
        [it.ratio, it.shortCost, it.longCost, ex.id],
      );
      updated++;
    }
  }
  return { inserted, updated };
}

async function collectAllPrices(pool) {
  const [plats] = await pool.query(
    "SELECT id, name, url, apiBaseUrl FROM platforms WHERE status IN ('operational','slow')",
  );
  console.log(`[pricing] ${new Date().toISOString()} 开始采集 ${plats.length} 个存活站点的价格`);
  const [runRes] = await pool.query(
    "INSERT INTO collector_runs (type, total) VALUES ('pricing', ?)",
    [plats.length],
  );
  const runId = runRes.insertId;
  let ok = 0, totalItems = 0, insertedTotal = 0, updatedTotal = 0;
  const CHUNK = 10;
  for (let i = 0; i < plats.length; i += CHUNK) {
    await Promise.allSettled(
      plats.slice(i, i + CHUNK).map(async (p) => {
        const items = await fetchPlatformPrices(p);
        if (!items) return;
        const { inserted, updated } = await upsertPrices(pool, p.id, items);
        ok++;
        totalItems += items.length;
        insertedTotal += inserted;
        updatedTotal += updated;
        console.log(`[pricing] ${p.name}: ${items.length} 个模型（新增 ${inserted} 更新 ${updated}）`);
      }),
    );
  }
  console.log(`[pricing] 完成：${ok}/${plats.length} 个站点有公开价格，共 ${totalItems} 条`);
  await pool.query(
    "UPDATE collector_runs SET finishedAt = NOW(), okCount = ?, failCount = ?, detail = ? WHERE id = ?",
    [
      ok,
      plats.length - ok,
      `站点:${ok}/${plats.length} 模型:${totalItems} 新增:${insertedTotal} 更新:${updatedTotal}`,
      runId,
    ],
  );
}

/* ------------------------------------------------------------------ */

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = mysql.createPool(url);

  let lastPriceRun = 0;
  const PRICE_INTERVAL = PRICE_INTERVAL_HOURS * 3600 * 1000;

  // 启动即执行一轮，之后按间隔循环
  for (;;) {
    try {
      await runOnce(pool);
    } catch (e) {
      console.error("[collector] 本轮失败:", e.message);
    }
    // 价格采集默认每 24 小时一轮（启动后立即跑第一轮）
    if (Date.now() - lastPriceRun > PRICE_INTERVAL) {
      try {
        await collectAllPrices(pool);
        lastPriceRun = Date.now();
      } catch (e) {
        console.error("[pricing] 价格采集失败:", e.message);
      }
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
  }
}

main().catch((e) => {
  console.error("[collector] fatal:", e);
  process.exit(1);
});
