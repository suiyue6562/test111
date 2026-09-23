#!/usr/bin/env node
/**
 * 百度主动推送（普通收录 API）：
 * 把站点 URL 主动推送给百度搜索资源平台，加快收录速度。
 *
 * 使用前提（一次性配置）：
 *  1. 登录 https://ziyuan.baidu.com 添加站点 apibuy.top 并完成验证
 *     （验证文件放进 public/ 即可，或用 BAIDU_VERIFY_TOKEN 环境变量走 meta 验证）
 *  2. 在「普通收录-API提交」拿到接口调用地址里的 token
 *  3. 服务器上配置 token（二选一）：
 *       pm2 env: BAIDU_PUSH_TOKEN=xxxx
 *       或写入 /root/.baidu-push-token 文件
 *  4. 手动跑：node scripts/baidu-push.cjs [--all]
 *     或加 crontab 每日推送（示例）：
 *       17 3 * * * cd /www/wwwroot/sk-buy && node scripts/baidu-push.cjs >> /var/log/baidu-push.log 2>&1
 *
 * 参数：
 *  --all   推送全量 URL（静态页 + 全部未关闭站点详情页）
 *  默认    只推近 3 天有更新的站点页 + 静态页（节省配额）
 */
require("dotenv/config");
const fs = require("fs");
const mysql = require("mysql2/promise");

const SITE = "https://apibuy.top";
const PUSH_ALL = process.argv.includes("--all");
const BATCH = 2000; // 百度单次上限 2000 条

function getToken() {
  if (process.env.BAIDU_PUSH_TOKEN) return process.env.BAIDU_PUSH_TOKEN.trim();
  try {
    return fs.readFileSync("/root/.baidu-push-token", "utf-8").trim();
  } catch {
    return "";
  }
}

async function collectUrls(pool) {
  const staticPages = [
    "/", "/pricing", "/leaderboard", "/discover", "/compare",
    "/forum", "/guide", "/sks", "/skt", "/skr", "/about", "/advertise",
  ].map((p) => SITE + p);

  let rows;
  if (PUSH_ALL) {
    [rows] = await pool.query(
      "SELECT domain FROM platforms WHERE status != 'closed'",
    );
  } else {
    [rows] = await pool.query(
      "SELECT domain FROM platforms WHERE status != 'closed' AND updatedAt >= DATE_SUB(NOW(), INTERVAL 3 DAY)",
    );
  }
  const sitePages = rows.map((r) => `${SITE}/site/${encodeURIComponent(r.domain)}`);
  return [...staticPages, ...sitePages];
}

async function pushBatch(token, urls) {
  const endpoint = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(SITE)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: urls.join("\n"),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

(async () => {
  const token = getToken();
  if (!token) {
    console.log(
      "[baidu-push] 未配置 token，跳过推送。\n" +
        "  请到 https://ziyuan.baidu.com 完成站点验证并获取「普通收录-API提交」token，\n" +
        "  然后配置 BAIDU_PUSH_TOKEN 环境变量或写入 /root/.baidu-push-token。",
    );
    process.exit(0);
  }
  const pool = mysql.createPool(process.env.DATABASE_URL);
  try {
    const urls = await collectUrls(pool);
    console.log(`[baidu-push] ${new Date().toISOString()} 待推送 ${urls.length} 条 URL（${PUSH_ALL ? "全量" : "近3天更新"}）`);
    for (let i = 0; i < urls.length; i += BATCH) {
      const batch = urls.slice(i, i + BATCH);
      const { status, body } = await pushBatch(token, batch);
      console.log(`[baidu-push] 批次 ${i / BATCH + 1}（${batch.length} 条）HTTP ${status} 返回：${body}`);
    }
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error("[baidu-push] 失败：", e);
  process.exit(1);
});
