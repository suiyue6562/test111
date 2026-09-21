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

function pad(n) { return String(n).padStart(2, "0"); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function probe(apiBaseUrl) {
  const base = (apiBaseUrl || "").replace(/\/+$/, "");
  if (!base) return { ok: false, latencyMs: null };
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${base}/models`, { signal: ctrl.signal, redirect: "manual" });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    // 200 正常；401/403 说明服务在线但需鉴权，也视为可达
    const reachable = res.status < 500;
    return { ok: reachable, latencyMs };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

const WORST = { ok: 0, slow: 1, down: 2, nodata: -1 };

async function runOnce(pool) {
  const [plats] = await pool.query(
    "SELECT id, name, apiBaseUrl, url, status FROM platforms WHERE stage != 'closed'",
  );
  console.log(`[collector] ${new Date().toISOString()} 探测 ${plats.length} 个平台`);
  const date = todayStr();

  // 10 路并发探测，避免大量平台时单轮耗时过长
  const CHUNK = 10;
  for (let i = 0; i < plats.length; i += CHUNK) {
    const batch = plats.slice(i, i + CHUNK);
    await Promise.allSettled(batch.map((p) => probeOne(pool, p, date)));
  }

  await recomputeScores(pool);
}

async function probeOne(pool, p, date) {
  try {
    const apiBase = p.apiBaseUrl || `${p.url.replace(/\/+$/, "")}/v1`;
    const r = await probe(apiBase);
    let dayStatus;
    if (!r.ok) dayStatus = "down";
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

    // 平台总状态跟随最新探测
    const newStatus = !r.ok ? "down" : r.latencyMs > 3000 ? "slow" : "operational";
    if (newStatus !== p.status) {
      await pool.query("UPDATE platforms SET status = ? WHERE id = ?", [newStatus, p.id]);
    }
    console.log(`[collector] ${p.name}: ${r.ok ? "可达" : "不可达"} ${r.latencyMs ?? "-"}ms`);
  } catch (e) {
    console.error(`[collector] ${p.name} 探测异常:`, e.message);
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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = mysql.createPool(url);

  // 启动即执行一轮，之后按间隔循环
  for (;;) {
    try {
      await runOnce(pool);
    } catch (e) {
      console.error("[collector] 本轮失败:", e.message);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
  }
}

main().catch((e) => {
  console.error("[collector] fatal:", e);
  process.exit(1);
});
