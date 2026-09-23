/**
 * AI 数据复核与站点简介任务（MiniMax M3）
 * - reviewPriceMutations: 对采集器标记的价格突变做 AI 复核，合理则自动确认，可疑则升级人工
 * - summarizePlatforms: 为缺少简介的站点生成「特点与优点」摘要（依据官网首页文本+价格数据）
 * - inferSiteNames: 对站名拉取失败（name=domain）的站点，AI 依据域名+已采数据推断品牌名；
 *   可信的直接改名，可疑的写入 name_reviews 队列，人工只复核可疑项
 * - aiHealthCheck: 价格数据健康巡检（异常值、归零聚集等），结果写入 collector_runs(type='ai')
 * 调度：collector.cjs 每 12 小时调用一次 runAiTasks（每天 2 次）
 */

const AI_BASE = (process.env.AI_API_BASE || "https://api.minimaxi.com/v1").replace(/\/+$/, "");
const AI_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "MiniMax-M3";
const AI_TIMEOUT = 180000; // M3 为推理模型，长输出需更宽超时（原 60s 频繁 abort）

async function chat(system, user, maxTokens = 4000) {
  if (!AI_KEY) throw new Error("AI_API_KEY 未配置");
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
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
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

/** 从 AI 输出中提取 JSON 数组（容忍 markdown 代码块） */
function parseJsonArray(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** 从 AI 输出中提取 JSON 对象（容忍 markdown 代码块） */
function parseJsonObject(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** canonical 模型归一化（与 api/pricing-router.ts 的规则保持一致） */
function canonicalModel(raw) {
  let s = String(raw).toLowerCase().trim();
  s = s.replace(/^[a-z0-9_.-]+\//, "");
  s = s.replace(/:.*$/, "");
  s = s.replace(/-20\d{2}-?\d{2}-?\d{2}$/, "");
  s = s.replace(/-(latest|preview|beta|exp|stable)$/, "");
  let m;
  if ((m = s.match(/^gpt-(5(?:\.\d+)?|4o|4\.1)(-mini|-nano|-pro)?$/)))
    return { label: `GPT-${m[1]}${m[2] ? m[2].replace("-", " ") : ""}`, family: "OpenAI" };
  if ((m = s.match(/^gpt-(5(?:\.\d+)?)-codex(-mini|-max)?$/)) || (m = s.match(/^codex(-mini)?$/))) {
    const base = s.startsWith("codex") ? "Codex" : `GPT-${m[1]} Codex`;
    const suffix = m[2] ? m[2].replace("-", " ") : "";
    return { label: `${base}${suffix ? ` ${suffix}` : ""}`, family: "OpenAI" };
  }
  if ((m = s.match(/^o[34](-mini|-pro)?$/)))
    return { label: m[0].replace("-mini", " mini").replace("-pro", " pro"), family: "OpenAI" };
  if ((m = s.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:[.-](\d+))?$/))) {
    const kind = m[1][0].toUpperCase() + m[1].slice(1);
    return { label: `Claude ${kind} ${m[3] ? `${m[2]}.${m[3]}` : m[2]}`, family: "Claude" };
  }
  if ((m = s.match(/^claude-3[.-]([57])-(opus|sonnet|haiku)$/))) {
    const kind = m[2][0].toUpperCase() + m[2].slice(1);
    return { label: `Claude 3.${m[1]} ${kind}`, family: "Claude" };
  }
  if ((m = s.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash)(-lite)?$/)))
    return { label: `Gemini ${m[1]} ${m[2][0].toUpperCase() + m[2].slice(1)}${m[3] ? " Lite" : ""}`, family: "Gemini" };
  if ((m = s.match(/^deepseek-(chat|reasoner)$/)))
    return { label: m[1] === "chat" ? "DeepSeek V3" : "DeepSeek R1", family: "DeepSeek" };
  if ((m = s.match(/^deepseek-(v3|r1)(\.\d+)?$/)))
    return { label: `DeepSeek ${m[1].toUpperCase()}`, family: "DeepSeek" };
  if ((m = s.match(/^qwen3?-(max|plus|turbo|flash)$/))) {
    const v = s.startsWith("qwen3") ? "Qwen3" : "Qwen";
    return { label: `${v} ${m[1][0].toUpperCase() + m[1].slice(1)}`, family: "Qwen" };
  }
  if (/^kimi-k2/.test(s)) return { label: "Kimi K2", family: "Kimi" };
  if ((m = s.match(/^glm-(\d+(?:\.\d+)?)(-air|-flash|-plus)?$/)))
    return { label: `GLM-${m[1]}${m[2] ? m[2].replace("-", " ") : ""}`, family: "GLM" };
  if ((m = s.match(/^grok-(\d+(?:\.\d+)?)(-mini|-fast|-heavy)?$/)))
    return { label: `Grok ${m[1]}${m[2] ? m[2].replace("-", " ") : ""}`, family: "xAI" };
  if ((m = s.match(/^doubao-(pro|lite|seed)/)))
    return { label: `豆包 ${m[1][0].toUpperCase() + m[1].slice(1)}`, family: "豆包" };
  if (/^minimax-(m[23]|abab)/.test(s)) {
    const mm = s.match(/m[23](?:\.\d+)?/);
    return { label: `MiniMax ${mm ? mm[0].toUpperCase() : "M"}`, family: "MiniMax" };
  }
  if (/^hunyuan-(large|pro|standard|turbo)/.test(s))
    return { label: "混元 " + s.replace(/^hunyuan-/, "").replace(/^\w/, (c) => c.toUpperCase()), family: "混元" };
  return null;
}

/** 价格突变 AI 复核：自动确认合理调价，可疑的保留人工复核 */
async function reviewPriceMutations(pool) {
  const [rows] = await pool.query(
    `SELECT pp.id, p.name AS platform, pp.model, pp.groupName, pp.prevRatio, pp.ratio, pp.shortCost
     FROM platform_prices pp JOIN platforms p ON p.id = pp.platformId
     WHERE pp.needReview = 1 ORDER BY pp.ratioChangedAt ASC LIMIT 200`,
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

/** 为站点生成「优势标签 + 决策摘要」（每轮最多 limit 个）
 *  标签：3-5 个 2-6 字短标签，展示在卡片上（如 低价优选/模型覆盖广/按次计费/企业合规）
 *  摘要：详情页使用的「优势+适合人群」段落 */
async function summarizePlatforms(pool, limit = 150) {
  const [plats] = await pool.query(
    `SELECT p.id, p.name, p.url, p.description, p.aiTags,
       (SELECT COUNT(DISTINCT model) FROM platform_prices WHERE platformId = p.id) AS models,
       (SELECT MIN(ratio) FROM platform_prices WHERE platformId = p.id AND ratio BETWEEN 0.1 AND 20) AS minRatio,
       (SELECT COUNT(DISTINCT groupName) FROM platform_prices WHERE platformId = p.id) AS \`groups\`,
       (SELECT COUNT(DISTINCT vendor) FROM platform_prices WHERE platformId = p.id) AS vendors
     FROM platforms p
     WHERE p.status IN ('operational','slow')
       AND (p.aiTags IS NULL OR p.description IS NULL OR CHAR_LENGTH(p.description) < 10
            OR p.description LIKE '收录自%' OR p.description LIKE '%暂未%' OR p.description LIKE '%有待补充%'
            OR p.description LIKE '%数据来源：%')
     ORDER BY p.visitCount DESC, p.id ASC
     LIMIT ?`,
    [limit],
  );
  let done = 0, failed = 0;
  for (const p of plats) {
    // 大多数中转站是 JS 单页应用，首页去标签后无文本——
    // 不再跳过，改用本站实测数据（供应商/模型数/倍率/价格组）让 AI 总结
    let homepage = await fetchHomepageText(p.url);
    if (!homepage) {
      homepage = "（官网为 JS 单页应用，抓不到静态介绍文本，请仅依据以下本站实测数据总结，不要编造官网信息）";
    }
    const facts = `站点名：${p.name}\n覆盖供应商数：${p.vendors}\n已采到模型数：${p.models}\n最低计费倍率：${p.minRatio ?? "无数据"}\n价格组数：${p.groups}\n官网首页文本：${homepage}`;
    try {
      const out = await chat(
        "你是 API 中转站导航站的编辑，输出必须是 JSON 对象，不要输出其他内容。",
        `${facts}\n\n基于以上事实，输出 JSON：{"tags":["..."],"summary":"..."}\n` +
          `tags：3-5 个优势标签，每个 2-6 个汉字，从这类角度提炼：低价优选、模型覆盖广、多供应商、按次计费、分组灵活、企业合规、海外直连、新站福利、高可用、免费额度等；` +
          `只写数据或官网能证实的优势，数据不足就少于 3 个，不要编造，不用"最/第一"。\n` +
          `summary：80 字以内中文，格式「优势一句话。适合：某类用户/场景」，同样只写可证实的事实，数据不足如实说明。`,
        1200,
      );
      const parsed = parseJsonObject(out);
      const tags = Array.isArray(parsed?.tags)
        ? parsed.tags.map((t) => String(t).trim()).filter((t) => t.length >= 2 && t.length <= 8).slice(0, 5)
        : [];
      const summary = String(parsed?.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (tags.length === 0 && summary.length < 10) { failed++; continue; }
      await pool.query(
        "UPDATE platforms SET description = ?, aiTags = ? WHERE id = ?",
        [summary.length >= 10 ? summary : p.description, JSON.stringify(tags), p.id],
      );
      done++;
    } catch (e) {
      failed++;
      console.log(`[ai] 简介生成失败 ${p.name}: ${String(e.message).slice(0, 80)}`);
    }
  }
  return { total: plats.length, done, failed };
}

/** 抓取官网 <title> 原文（用于品牌名推断），失败返回 null */
async function fetchHomeTitle(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SKBuyBot/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return null;
    return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 120);
  } catch {
    return null;
  }
}

/** 品牌名合法性校验：AI 输出必须过这一层才允许直写 platforms.name */
function validBrandName(name, domain) {
  const s = String(name || "").trim();
  if (s.length < 2 || s.length > 24) return false;
  if (!/[A-Za-z\u4e00-\u9fff]/.test(s)) return false;
  if (/\./.test(s)) return false; // 不允许残留域名/后缀形态
  const flat = s.toLowerCase().replace(/[\s._-]/g, "");
  const dflat = String(domain).toLowerCase().replace(/^www\./, "").replace(/[\s._-]/g, "");
  if (flat === dflat) return false; // 完整域名直接当名
  if (/^(api|www|dev|ai|chat|gpt|llm)$/.test(flat)) return false; // 无意义泛词
  if (/^(new\s*api|one\s*api|midjourney[- ]?proxy|next[- ]?chat|chatgpt[- ]?next|lobe[- ]?chat|lobechat|fastgpt)$/i.test(s)) return false;
  return true;
}

/** AI 品牌名推断：对 name=domain（站名拉取失败）的站点，依据域名+已有信息推断品牌名。
 *  - 推断可信 → 直接更新 platforms.name
 *  - 可疑（无法可靠推断/像默认模板/与域名无关联）→ 写入 name_reviews 队列，人工只复核这些
 *  每次最多处理 limit 个，人工已处理（approved/rejected）的不再重复入队。
 */
async function inferSiteNames(pool, limit = 80) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS name_reviews (
       id INT AUTO_INCREMENT PRIMARY KEY,
       platformId INT NOT NULL,
       domain VARCHAR(255) NOT NULL,
       aiName VARCHAR(100) NOT NULL,
       reason VARCHAR(200) DEFAULT '',
       status ENUM('pending','approved','rejected') DEFAULT 'pending',
       createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       resolvedAt TIMESTAMP NULL DEFAULT NULL,
       UNIQUE KEY uniq_platform (platformId)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  const [plats] = await pool.query(
    `SELECT p.id, p.name, p.domain, p.url, p.description, p.tags, p.status,
       (SELECT COUNT(DISTINCT model) FROM platform_prices WHERE platformId = p.id) AS models,
       (SELECT GROUP_CONCAT(DISTINCT vendor SEPARATOR ',') FROM platform_prices WHERE platformId = p.id AND vendor IS NOT NULL) AS vendors
     FROM platforms p
     WHERE p.name = p.domain
       AND NOT EXISTS (SELECT 1 FROM name_reviews nr WHERE nr.platformId = p.id AND nr.status != 'pending')
     ORDER BY (p.status = 'operational') DESC, p.visitCount DESC, p.id ASC
     LIMIT ?`,
    [limit],
  );
  if (plats.length === 0) return { total: 0, applied: 0, queued: 0 };

  // 逐站抓官网 <title>（失败的也有域名与已采数据可用）
  const facts = [];
  for (const p of plats) {
    const title = await fetchHomeTitle(p.url);
    facts.push({
      id: Number(p.id), 域名: p.domain,
      官网标题: title || "（拉取失败）",
      简介: String(p.description || "").slice(0, 100),
      供应商: p.vendors ? String(p.vendors).split(",").slice(0, 6).join(",") : "无",
      模型数: Number(p.models),
      状态: p.status,
    });
  }
  // 分批调用 AI（每批 ≤20 站，避免大批量输出截断导致 JSON 解析失败）
  const guesses = [];
  let parseError = false;
  const BATCH = 20;
  for (let i = 0; i < facts.length; i += BATCH) {
    const chunk = facts.slice(i, i + BATCH);
    const out = await chat(
      "你是 API 中转站导航站的编辑，输出必须是 JSON 数组，不要输出其他内容。",
      `以下站点的品牌名采集全部失败（库中站名=域名），请为每个站点推断用户认知中的品牌显示名。\n` +
        `规则：\n` +
        `1. 优先采用官网标题里的真实品牌名（去掉「- 官网」「| 首页」等尾巴）。\n` +
        `2. 标题是建站模板默认名（New API/One API/LobeChat 等）、纯「首页/官网」类无效词、或拉取失败时，依据域名含义与简介推断；域名本身是可读单词的可用其单词形态（如 coderelay.cn → Coderelay）。\n` +
        `3. 输出中文或英文品牌名，2-24 字，不要带域名后缀，不要编造与站点无关的名字。\n` +
        `4. 信息太少无法可靠推断时，name 给最佳猜测并标 "suspect": true；能确定时 "suspect": false。\n` +
        `5. reason：12 字内说明依据（如「标题含品牌名」「按域名推断」「信息不足」）。\n` +
        `对每站输出 {"id":数字,"name":"品牌名","suspect":true/false,"reason":"..."}。\n站点：\n${JSON.stringify(chunk)}`,
      4000,
    );
    const part = parseJsonArray(out);
    if (part) guesses.push(...part);
    else parseError = true;
  }
  if (guesses.length === 0) return { total: plats.length, applied: 0, queued: 0, parseError: true };

  let applied = 0, queued = 0;
  for (const g of guesses) {
    const id = Number(g.id);
    const name = String(g.name || "").trim();
    if (!id || !name) continue;
    const p = plats.find((x) => Number(x.id) === id);
    if (!p) continue;
    const suspect = Boolean(g.suspect) || !validBrandName(name, p.domain);
    if (!suspect) {
      const r = await pool.query(
        "UPDATE platforms SET name = ?, updatedAt = NOW() WHERE id = ? AND name = domain",
        [name.slice(0, 60), id],
      );
      if (r[0].affectedRows > 0) {
        applied++;
        // 之前有 pending 存疑记录的，改名成功后清掉
        await pool.query("DELETE FROM name_reviews WHERE platformId = ? AND status = 'pending'", [id]);
      }
    } else {
      await pool.query(
        `INSERT INTO name_reviews (platformId, domain, aiName, reason, status) VALUES (?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE aiName = VALUES(aiName), reason = VALUES(reason), createdAt = NOW()`,
        [id, p.domain, name.slice(0, 100), String(g.reason || "").slice(0, 80)],
      );
      queued++;
    }
  }
  return { total: plats.length, applied, queued, parseError };
}

/** AI 站点推荐打分：批量评估，写 platforms.score（0-100），排行榜「精选」排序用 */
async function scorePlatforms(pool, limit = 40) {
  // M3 推理模型的 <think> 段会吃掉输出额度：40 站一批 4000 token 必截断成非法 JSON，
  // 缩小批次到 20、放大 max_tokens，保证数组完整返回
  const BATCH = 20;
  const MAX_TOKENS = 8000;
  const [plats] = await pool.query(
    `SELECT p.id, p.name, p.apiConfirmed, p.visitCount, p.stage,
       (SELECT COUNT(DISTINCT model) FROM platform_prices WHERE platformId = p.id) AS models,
       (SELECT MIN(ratio) FROM platform_prices WHERE platformId = p.id AND ratio BETWEEN 0.1 AND 20) AS minRatio,
       (SELECT AVG(rating) FROM reviews WHERE platformId = p.id AND status = 'published') AS avgRating,
       (SELECT COUNT(*) FROM reviews WHERE platformId = p.id AND status = 'published') AS reviewCount
     FROM platforms p
     WHERE p.status IN ('operational','slow')
     ORDER BY (p.aiScoredAt IS NULL) DESC, p.aiScoredAt ASC, p.visitCount DESC
     LIMIT ?`,
    [Math.min(limit, BATCH)],
  );
  if (plats.length === 0) return { total: 0, done: 0 };
  // 30 天可用率与延迟
  const ids = plats.map((p) => p.id);
  const [stats] = await pool.query(
    `SELECT platformId,
       COUNT(CASE WHEN status != 'nodata' THEN 1 END) AS measured,
       COUNT(CASE WHEN status = 'ok' THEN 1 END) AS ok,
       AVG(CASE WHEN latencyMs IS NOT NULL AND status != 'nodata' THEN latencyMs END) AS avgLat
     FROM platform_daily_status
     WHERE platformId IN (${ids.map(() => "?").join(",")}) AND date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
     GROUP BY platformId`,
    ids,
  );
  const statOf = new Map(stats.map((s) => [Number(s.platformId), s]));
  const list = plats.map((p) => {
    const s = statOf.get(Number(p.id));
    return {
      id: Number(p.id), 站点: p.name,
      可用率30天: s && Number(s.measured) > 0 ? `${((Number(s.ok) / Number(s.measured)) * 100).toFixed(0)}%` : "无数据",
      平均延迟ms: s?.avgLat ? Math.round(Number(s.avgLat)) : "无数据",
      模型数: Number(p.models), 最低倍率: p.minRatio ?? "无",
      API实测: p.apiConfirmed ? "是" : "否",
      用户评分: p.avgRating ? `${Number(p.avgRating).toFixed(1)}(${p.reviewCount}条)` : "无",
      访问量: p.visitCount, 阶段: p.stage,
    };
  });
  const out = await chat(
    "你是 API 中转站导航站的推荐算法评审，输出必须是 JSON 数组，不要输出其他内容。",
    `给以下站点打推荐分（0-100 整数）。权重导向：可用率和实测数据最重要，其次价格竞争力与用户口碑，访问量仅作参考；数据不足的站保守给分（40-55），表现全面优秀的站才给 85+。\n` +
      `对每站输出 {"id":数字,"score":数字,"reason":"12字内中文"}。\n站点数据：\n${JSON.stringify(list)}`,
    MAX_TOKENS,
  );
  const scores = parseJsonArray(out);
  if (!scores) return { total: plats.length, done: 0, parseError: true };
  let done = 0;
  for (const s of scores) {
    const score = Math.max(0, Math.min(100, Math.round(Number(s.score))));
    if (!Number.isFinite(score)) continue;
    const r = await pool.query("UPDATE platforms SET score = ?, aiScoredAt = NOW() WHERE id = ?", [score, Number(s.id)]);
    if (r[0].affectedRows > 0) done++;
  }
  return { total: plats.length, done };
}

/** AI 模型档案：为热门 canonical 模型生成简介+能力标签（排行榜头卡用） */
async function modelProfiles(pool, limit = 8) {
  const [rows] = await pool.query(
    `SELECT DISTINCT model, platformId FROM platform_prices`,
  );
  const byLabel = new Map();
  for (const r of rows) {
    const c = canonicalModel(r.model);
    if (!c) continue;
    const cur = byLabel.get(c.label) ?? { label: c.label, family: c.family, pids: new Set() };
    cur.pids.add(Number(r.platformId));
    byLabel.set(c.label, cur);
  }
  const hot = [...byLabel.values()]
    .map((e) => ({ label: e.label, family: e.family, sellers: e.pids.size }))
    .sort((a, b) => b.sellers - a.sellers);
  const [existing] = await pool.query("SELECT label FROM model_profiles");
  const have = new Set(existing.map((e) => e.label));
  const todo = hot.filter((h) => !have.has(h.label)).slice(0, limit);
  if (todo.length === 0) {
    // 更新在售站数快照
    for (const h of hot.slice(0, 30)) {
      await pool.query("UPDATE model_profiles SET sellers = ? WHERE label = ?", [h.sellers, h.label]);
    }
    return { total: 0, done: 0 };
  }
  const out = await chat(
    "你是大模型领域的编辑，输出必须是 JSON 对象，不要输出其他内容。",
    `为以下 AI 模型写档案。输出 JSON：{"模型名":{"blurb":"60字内中文介绍（定位与适用场景）","tags":["3-5个能力标签，如 推理/编码/长上下文/多模态/高性价比"]}}\n` +
      `只写公认的模型特点，不确定就写通用描述。模型：\n${todo.map((t) => `${t.label}（${t.family}）`).join("\n")}`,
    3000,
  );
  const parsed = parseJsonObject(out);
  if (!parsed) return { total: todo.length, done: 0, parseError: true };
  let done = 0;
  for (const t of todo) {
    const p = parsed[t.label];
    if (!p?.blurb) continue;
    const tags = Array.isArray(p.tags) ? p.tags.map((x) => String(x).slice(0, 8)).slice(0, 5) : [];
    await pool.query(
      "INSERT INTO model_profiles (label, family, blurb, tags, sellers) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE blurb = VALUES(blurb), tags = VALUES(tags), sellers = VALUES(sellers)",
      [t.label, t.family, String(p.blurb).slice(0, 200), JSON.stringify(tags), t.sellers],
    );
    done++;
  }
  return { total: todo.length, done };
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
  // 每个子任务独立容错：一个失败不影响其他（MiniMax 偶发超时/中止）
  const safe = async (label, fn, fallback) => {
    try {
      return await fn();
    } catch (e) {
      ok = false;
      details.push(`${label}失败:${String(e.message).slice(0, 60)}`);
      console.error(`[ai] ${label}失败:`, e.message);
      return fallback;
    }
  };
  const review = await safe("复核", () => reviewPriceMutations(pool), null);
  if (review) details.push(`复核:${review.skipped ? "无待复核" : `${review.reviewed}条(自动确认${review.autoOk}/存疑${review.suspect})`}`);
  const summ = await safe("简介", () => summarizePlatforms(pool), null);
  if (summ) details.push(`简介:${summ.done}/${summ.total}生成`);
  const score = await safe("打分", () => scorePlatforms(pool), null);
  if (score) details.push(`打分:${score.done}/${score.total}`);
  const mp = await safe("档案", () => modelProfiles(pool), null);
  if (mp) details.push(`档案:${mp.done}/${mp.total}`);
  const names = await safe("站名", () => inferSiteNames(pool), null);
  if (names && names.total > 0) details.push(`站名:推断${names.applied ?? 0}/存疑${names.queued ?? 0}(共${names.total})`);
  const health = await safe("巡检", () => aiHealthCheck(pool), null);
  if (health) details.push(`巡检:总${health.total} 负值${health.negative ?? 0} 极端${health.extreme ?? 0} 超48h${health.stale48h ?? 0} 待复核余${health.pendingReview ?? 0}`);
  await pool.query(
    "UPDATE collector_runs SET finishedAt = NOW(), okCount = ?, failCount = ?, detail = ? WHERE id = ?",
    [ok ? 1 : 0, ok ? 0 : 1, details.join(" | ").slice(0, 480), runId],
  );
  console.log(`[ai] 完成：${details.join(" | ")}`);
}

module.exports = { runAiTasks };

