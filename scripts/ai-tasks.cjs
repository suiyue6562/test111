/**
 * AI 数据复核与站点简介任务（MiniMax M3）
 * - reviewPriceMutations: 对采集器标记的价格突变做 AI 复核，合理则自动确认，可疑则升级人工
 * - summarizePlatforms: 为缺少简介的站点生成「特点与优点」摘要（依据官网首页文本+价格数据）
 * - aiHealthCheck: 价格数据健康巡检（异常值、归零聚集等），结果写入 collector_runs(type='ai')
 * 调度：collector.cjs 每 12 小时调用一次 runAiTasks（每天 2 次）
 */

const AI_BASE = (process.env.AI_API_BASE || "https://api.minimaxi.com/v1").replace(/\/+$/, "");
const AI_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "MiniMax-M3";
const AI_TIMEOUT = 60000;

async function chat(system, user, maxTokens = 4000) {
  if (!AI_KEY) throw new Error("AI_API_KEY 未配置");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), AI_TIMEOUT);
  try {
    const res = await fetch(`${AI_BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    let content = j?.choices?.[0]?.message?.content ?? "";
    // M3 为推理模型，剥离 <think> 段
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return content;
  } finally {
    clearTimeout(t);
  }
}

/** 从 AI 输出中提取 JSON 数组（容忍 markdown 代码块） */
function parseJsonArray(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** 价格突变 AI 复核：自动确认合理调价，可疑的保留人工复核 */
async function reviewPriceMutations(pool) {
  const [rows] = await pool.query(
    `SELECT pp.id, p.name AS platform, pp.model, pp.groupName, pp.prevRatio, pp.ratio, pp.shortCost
     FROM platform_prices pp JOIN platforms p ON p.id = pp.platformId
     WHERE pp.needReview = 1 ORDER BY pp.ratioChangedAt ASC LIMIT 60`,
  );
  if (rows.length === 0) return { reviewed: 0, autoOk: 0, suspect: 0, skipped: true };

  const list = rows.map((r) => ({
    id: Number(r.id), 站点: r.platform, 模型: r.model, 价格组: r.groupName,
    旧倍率: Number(r.prevRatio), 新倍率: Number(r.ratio),
  }));
  const out = await chat(
    "你是 API 中转站价格数据审核员，输出必须是 JSON 数组，不要输出其他内容。",
    `以下是采集器标记的价格突变记录（倍率=相对官方价的人民币倍数；新倍率 0 表示该模型改为按次计费）。\n` +
      `判断每条是否属于正常站点调价。正常：促销降价、计费方式切换（倍率→0）、分组价格调整、官方调价传导。可疑：倍率变成天文数字（>100）、全站模型同毫秒集体归零等疑似抓取错误。\n` +
      `对每条输出 {"id":数字,"verdict":"ok"或"suspect","reason":"10字内中文"}。\n记录：\n${JSON.stringify(list)}`,
  );
  const verdicts = parseJsonArray(out);
  if (!verdicts) return { reviewed: 0, autoOk: 0, suspect: 0, parseError: true };

  let autoOk = 0, suspect = 0;
  for (const v of verdicts) {
    const id = Number(v.id);
    if (!id) continue;
    if (v.verdict === "ok") {
      await pool.query("UPDATE platform_prices SET needReview = 0 WHERE id = ? AND needReview = 1", [id]);
      autoOk++;
    } else {
      suspect++;
    }
  }
  return { reviewed: verdicts.length, autoOk, suspect };
}

/** 抓取官网首页文本（去标签截断），失败返回 null */
async function fetchHomepageText(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SKBuyBot/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);
  } catch {
    return null;
  }
}

/** 为缺简介的站点生成特点/优点摘要（每轮最多 limit 个） */
async function summarizePlatforms(pool, limit = 40) {
  const [plats] = await pool.query(
    `SELECT p.id, p.name, p.url, p.description,
       (SELECT COUNT(DISTINCT model) FROM platform_prices WHERE platformId = p.id) AS models,
       (SELECT MIN(ratio) FROM platform_prices WHERE platformId = p.id AND ratio > 0) AS minRatio,
       (SELECT COUNT(DISTINCT groupName) FROM platform_prices WHERE platformId = p.id) AS groups
     FROM platforms p
     WHERE p.status IN ('operational','slow')
       AND (p.description IS NULL OR CHAR_LENGTH(p.description) < 10 OR p.description LIKE '收录自%')
     ORDER BY p.visitCount DESC, p.id ASC
     LIMIT ?`,
    [limit],
  );
  let done = 0, failed = 0;
  for (const p of plats) {
    const homepage = await fetchHomepageText(p.url);
    if (!homepage) { failed++; continue; }
    const facts = `站点名：${p.name}\n已采到模型数：${p.models}\n最低倍率：${p.minRatio ?? "无"}\n价格组数：${p.groups}\n官网首页文本：${homepage}`;
    try {
      const summary = await chat(
        "你是 API 中转站导航站的编辑，为站点写一句客观简介。",
        `${facts}\n\n要求：中文，80 字以内，说明该站覆盖模型、价格水平、特色（如分组/按次计费/逆向等），只写事实，不用广告词和"最/第一"，不夸大。直接输出简介文本。`,
        800,
      );
      const text = summary.replace(/\s+/g, " ").trim().slice(0, 200);
      if (text.length >= 10) {
        await pool.query("UPDATE platforms SET description = ? WHERE id = ?", [text, p.id]);
        done++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      console.log(`[ai] 简介生成失败 ${p.name}: ${String(e.message).slice(0, 80)}`);
    }
  }
  return { total: plats.length, done, failed };
}

/** 数据健康巡检：异常价格聚集检测 */
async function aiHealthCheck(pool) {
  const [[stats]] = await pool.query(
    `SELECT
       COUNT(*) total,
       SUM(CASE WHEN ratio < 0 THEN 1 ELSE 0 END) negative,
       SUM(CASE WHEN ratio > 100 THEN 1 ELSE 0 END) extreme,
       SUM(CASE WHEN collectedAt < DATE_SUB(NOW(), INTERVAL 48 HOUR) OR collectedAt IS NULL THEN 1 ELSE 0 END) stale48h,
       SUM(needReview) pendingReview
     FROM platform_prices`,
  );
  return stats;
}

/** 每日 2 次的 AI 任务入口 */
async function runAiTasks(pool) {
  if (!AI_KEY) {
    console.log("[ai] AI_API_KEY 未配置，跳过 AI 任务");
    return;
  }
  console.log(`[ai] ${new Date().toISOString()} 开始 AI 任务（复核+简介+巡检）`);
  const [runRes] = await pool.query("INSERT INTO collector_runs (type, total) VALUES ('ai', 0)");
  const runId = runRes.insertId;
  const details = [];
  let ok = true;
  try {
    const review = await reviewPriceMutations(pool);
    details.push(`复核:${review.skipped ? "无待复核" : `${review.reviewed}条(自动确认${review.autoOk}/存疑${review.suspect})`}`);
    const summ = await summarizePlatforms(pool);
    details.push(`简介:${summ.done}/${summ.total}生成`);
    const health = await aiHealthCheck(pool);
    details.push(`巡检:总${health.total} 负值${health.negative ?? 0} 极端${health.extreme ?? 0} 超48h${health.stale48h ?? 0} 待复核余${health.pendingReview ?? 0}`);
  } catch (e) {
    ok = false;
    details.push(`错误:${String(e.message).slice(0, 120)}`);
    console.error("[ai] 任务失败:", e.message);
  }
  await pool.query(
    "UPDATE collector_runs SET finishedAt = NOW(), okCount = ?, failCount = ?, detail = ? WHERE id = ?",
    [ok ? 1 : 0, ok ? 0 : 1, details.join(" | ").slice(0, 480), runId],
  );
  console.log(`[ai] 完成：${details.join(" | ")}`);
}

module.exports = { runAiTasks };
