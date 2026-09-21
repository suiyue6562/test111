import "dotenv/config";
import { getDb } from "../api/queries/connection";
import * as schema from "./schema";
import { eq } from "drizzle-orm";
import { scryptSync, randomBytes } from "crypto";

function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pw, salt, 64).toString("hex");
}

const VENDORS = ["OpenAI", "Claude", "Gemini", "DeepSeek", "Qwen", "Kimi", "GLM", "MiniMax", "xAI"];

const MODELS: Record<string, string[]> = {
  OpenAI: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
  Claude: ["claude-sonnet-4.5", "claude-opus-4.1"],
  Gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
  DeepSeek: ["deepseek-v3.2", "deepseek-r1"],
  Qwen: ["qwen3-max", "qwen3-plus"],
  Kimi: ["kimi-k2", "kimi-k2-thinking"],
  GLM: ["glm-4.6", "glm-4.6-air"],
  MiniMax: ["minimax-m2"],
  xAI: ["grok-4", "grok-4-fast"],
};

// 基准倍率（虚构演示数据）
const BASE_RATIO: Record<string, number> = {
  "gpt-5": 1.0, "gpt-5-mini": 0.2, "gpt-4.1": 0.6,
  "claude-sonnet-4.5": 1.0, "claude-opus-4.1": 3.0,
  "gemini-2.5-pro": 0.8, "gemini-2.5-flash": 0.15,
  "deepseek-v3.2": 0.1, "deepseek-r1": 0.3,
  "qwen3-max": 0.4, "qwen3-plus": 0.12,
  "kimi-k2": 0.25, "kimi-k2-thinking": 0.5,
  "glm-4.6": 0.2, "glm-4.6-air": 0.06,
  "minimax-m2": 0.15,
  "grok-4": 1.2, "grok-4-fast": 0.3,
};

const PLATFORMS: Array<{
  name: string; domain: string; vendors: string[]; tags: string[];
  status: "operational" | "slow" | "down" | "unknown";
  stage: "new" | "stable" | "watch" | "closed";
  featured: boolean; reliability: number; baseLatency: number; desc: string;
}> = [
  { name: "星云 API", domain: "api.nebulallm.cn", vendors: ["OpenAI", "Claude", "Gemini", "xAI"], tags: ["按量计费", "企业级"], status: "operational", stage: "stable", featured: true, reliability: 1.0, baseLatency: 320, desc: "主打高可用与多模型覆盖的聚合中转站，支持按量计费与额度共享。" },
  { name: "光速中转", domain: "api.lightspeedai.top", vendors: ["OpenAI", "DeepSeek", "Qwen"], tags: ["低延迟", "国内直连"], status: "operational", stage: "stable", featured: true, reliability: 0.996, baseLatency: 58, desc: "面向国内用户的低延迟中转，GPT 系列响应极快。" },
  { name: "蓝海聚合", domain: "api.blueoceanai.cc", vendors: ["Claude", "Gemini", "DeepSeek", "Kimi", "Qwen", "GLM", "MiniMax"], tags: ["国产模型全", "价格亲民"], status: "operational", stage: "stable", featured: true, reliability: 1.0, baseLatency: 240, desc: "国产模型覆盖最全的站点之一，价格低，适合日常调用。" },
  { name: "极客网关", domain: "gw.geekapi.dev", vendors: ["OpenAI", "Claude"], tags: ["开发者", "高并发"], status: "operational", stage: "stable", featured: true, reliability: 0.99, baseLatency: 410, desc: "为开发者设计的高并发网关，支持批量调用与 Webhook 回调。" },
  { name: "橙子 API", domain: "api.orangellm.vip", vendors: ["OpenAI", "Claude", "Gemini"], tags: ["新站福利"], status: "operational", stage: "new", featured: true, reliability: 1.0, baseLatency: 96, desc: "新上线的聚合站，注册送体验额度，模型更新速度快。" },
  { name: "云帆 API", domain: "api.yunfanllm.com", vendors: ["DeepSeek", "Qwen", "GLM", "Kimi"], tags: ["国产专线"], status: "operational", stage: "stable", featured: true, reliability: 0.997, baseLatency: 180, desc: "专注国产大模型的专线中转，稳定性好。" },
  { name: "磐石 API", domain: "api.rockapi.cn", vendors: ["OpenAI", "Claude", "Gemini", "xAI", "DeepSeek"], tags: ["老牌站点", "稳定"], status: "operational", stage: "stable", featured: true, reliability: 0.993, baseLatency: 890, desc: "运营多年的老站，渠道多，适合作为备用源。" },
  { name: "萤火 API", domain: "api.fireflyai.icu", vendors: ["OpenAI", "Kimi", "MiniMax"], tags: ["轻量", "按次付费"], status: "operational", stage: "stable", featured: true, reliability: 0.998, baseLatency: 350, desc: "轻量灵活的按次付费中转，适合个人轻度使用。" },
  { name: "量子驿站", domain: "api.quantumstop.xyz", vendors: ["Claude", "Gemini", "xAI"], tags: ["海外渠道"], status: "slow", stage: "stable", featured: true, reliability: 1.0, baseLatency: 3600, desc: "海外官方渠道聚合，稳定性高但延迟偏大。" },
  { name: "蜂鸟中转", domain: "api.hummingapi.top", vendors: ["OpenAI", "DeepSeek", "Qwen", "GLM"], tags: ["低价", "学生友好"], status: "operational", stage: "stable", featured: true, reliability: 0.988, baseLatency: 420, desc: "价格低廉的中转站，适合学生与高频调用用户。" },
  { name: "明镜 API", domain: "api.mirrorllm.cn", vendors: ["OpenAI", "Claude", "Gemini", "DeepSeek", "Qwen", "Kimi", "GLM", "MiniMax", "xAI"], tags: ["全模型", "一站购齐"], status: "operational", stage: "stable", featured: true, reliability: 0.995, baseLatency: 520, desc: "九家供应商全覆盖的全模型聚合站。" },
  { name: "沧海 API", domain: "api.canghai.cc", vendors: ["DeepSeek", "Qwen"], tags: ["专注国产"], status: "operational", stage: "stable", featured: true, reliability: 1.0, baseLatency: 130, desc: "只做 DeepSeek 与 Qwen 的精品小站，价格实惠。" },
  { name: "白鹭 API", domain: "api.egretai.net", vendors: ["OpenAI", "Claude", "Kimi"], tags: ["新站收录"], status: "operational", stage: "new", featured: false, reliability: 0.982, baseLatency: 260, desc: "新收录站点，目前处于观察期。" },
  { name: "铁牛 API", domain: "api.bullapi.vip", vendors: ["OpenAI", "Gemini", "GLM"], tags: ["大额度", "团队版"], status: "slow", stage: "watch", featured: false, reliability: 0.95, baseLatency: 5200, desc: "面向团队的大额度套餐站，近期波动较大，观察中。" },
  { name: "灵犀 API", domain: "api.lingxi.art", vendors: ["Kimi", "MiniMax", "Qwen"], tags: ["长文本"], status: "operational", stage: "stable", featured: false, reliability: 0.999, baseLatency: 210, desc: "长文本场景优化，Kimi 系列价格优势明显。" },
  { name: "琥珀 API", domain: "api.amberllm.com", vendors: ["Claude", "OpenAI"], tags: ["Claude 专线"], status: "operational", stage: "stable", featured: false, reliability: 0.994, baseLatency: 680, desc: "Claude 渠道专线，代码场景表现出色。" },
  { name: "疾风 API", domain: "api.galellm.top", vendors: ["OpenAI", "DeepSeek", "xAI"], tags: ["速度快"], status: "operational", stage: "new", featured: false, reliability: 1.0, baseLatency: 72, desc: "新晋速度型站点，OpenAI 通道延迟极低。" },
  { name: "天枢 API", domain: "api.tianshu.dev", vendors: ["Qwen", "GLM", "DeepSeek", "Kimi"], tags: ["企业采购"], status: "operational", stage: "stable", featured: false, reliability: 0.997, baseLatency: 300, desc: "支持企业采购与对公结算的国产模型聚合站。" },
  { name: "梧桐 API", domain: "api.wutongllm.cn", vendors: ["OpenAI", "Gemini"], tags: ["备用源"], status: "unknown", stage: "watch", featured: false, reliability: 0.9, baseLatency: 1500, desc: "小型备用源站点，监控数据积累中。" },
  { name: "彩虹桥 API", domain: "api.rainbowbridge.cc", vendors: ["Claude", "Gemini", "MiniMax"], tags: ["多模态"], status: "operational", stage: "stable", featured: false, reliability: 0.992, baseLatency: 450, desc: "多模态模型支持较好的聚合站，图像模型齐全。" },
];

function pad(n: number) { return String(n).padStart(2, "0"); }
function dateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const db = getDb();

  // ---- 用户 ----
  const adminHash = hashPassword("admin123");
  const demoHash = hashPassword("demo1234");
  await db.insert(schema.users).values([
    { unionId: "local_admin", name: "admin", role: "admin", passwordHash: adminHash },
    { unionId: "local_demo", name: "demo_user", role: "user", passwordHash: demoHash },
    { unionId: "local_station1", name: "星云站长", role: "user", passwordHash: demoHash },
  ]).onDuplicateKeyUpdate({ set: { name: "admin" } });

  // ---- 平台 ----
  const platformIds: number[] = [];
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i];
    await db.insert(schema.platforms).values({
      name: p.name,
      domain: p.domain,
      url: `https://${p.domain}`,
      apiBaseUrl: `https://${p.domain}/v1`,
      description: p.desc,
      vendors: p.vendors,
      tags: p.tags,
      status: p.status,
      stage: p.stage,
      featured: p.featured,
      visitCount: Math.floor(200 + 3000 * ((i * 37) % 100) / 100),
    }).onDuplicateKeyUpdate({ set: { name: p.name } });
    const [row] = await db.select().from(schema.platforms).where(eq(schema.platforms.domain, p.domain));
    platformIds.push(row.id);
  }

  // ---- 每日状态（近 30 天） ----
  const existingStatus = await db.select().from(schema.platformDailyStatus).limit(1);
  if (existingStatus.length === 0) {
    const rows: Array<Omit<schema.PlatformDailyStatus, "id">> = [];
    for (let i = 0; i < PLATFORMS.length; i++) {
      const p = PLATFORMS[i];
      const rnd = mulberry32(i * 7919 + 13);
      for (let d = 29; d >= 0; d--) {
        const date = new Date(); date.setDate(date.getDate() - d);
        const r = rnd();
        let st: "ok" | "slow" | "down" | "nodata" = "ok";
        if (r > p.reliability) st = rnd() > 0.5 ? "down" : "slow";
        else if (p.status === "slow" && rnd() > 0.6) st = "slow";
        const jitter = p.baseLatency * (0.7 + rnd() * 0.6);
        rows.push({
          platformId: platformIds[i],
          date: dateStr(date),
          status: st,
          latencyMs: st === "down" ? null : Math.round(st === "slow" ? jitter * 2.5 : jitter),
        });
      }
    }
    for (let k = 0; k < rows.length; k += 200) {
      await db.insert(schema.platformDailyStatus).values(rows.slice(k, k + 200));
    }
  }

  // ---- 价格 ----
  const existingPrices = await db.select().from(schema.platformPrices).limit(1);
  if (existingPrices.length === 0) {
    const rnd = mulberry32(4242);
    const priceRows: schema.InsertPlatformPrice[] = [];
    for (let i = 0; i < PLATFORMS.length; i++) {
      for (const vendor of PLATFORMS[i].vendors) {
        for (const model of MODELS[vendor]) {
          if (rnd() < 0.25) continue; // 不是每个站都有每个模型
          const base = BASE_RATIO[model];
          const ratio = Math.max(0.01, base * (0.05 + rnd() * 1.1));
          priceRows.push({
            platformId: platformIds[i],
            vendor, model,
            groupName: rnd() > 0.7 ? "vip" : "default",
            ratio: ratio.toFixed(4),
            shortCost: (ratio * (0.02 + rnd() * 0.03)).toFixed(4),
            longCost: (ratio * (0.15 + rnd() * 0.35)).toFixed(4),
          });
        }
      }
    }
    for (let k = 0; k < priceRows.length; k += 200) {
      await db.insert(schema.platformPrices).values(priceRows.slice(k, k + 200));
    }
  }

  // ---- 论坛板块 ----
  const CATS = [
    { slug: "general", name: "综合交流", description: "AI API 使用经验交流", sort: 1 },
    { slug: "welfare", name: "福利羊毛", description: "福利、抽奖、额度活动", sort: 2 },
    { slug: "redeem", name: "发码活动", description: "兑换码发放与领取讨论", sort: 3 },
    { slug: "reviews", name: "站点点评", description: "中转站使用体验点评", sort: 4 },
    { slug: "feedback", name: "站务反馈", description: "功能建议与问题反馈", sort: 5 },
  ];
  for (const c of CATS) {
    await db.insert(schema.forumCategories).values(c).onDuplicateKeyUpdate({ set: { name: c.name } });
  }
  const cats = await db.select().from(schema.forumCategories);
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

  const users = await db.select().from(schema.users);
  const adminId = users.find((u) => u.unionId === "local_admin")!.id;
  const demoId = users.find((u) => u.unionId === "local_demo")!.id;
  const stationId = users.find((u) => u.unionId === "local_station1")!.id;

  // ---- 帖子 ----
  const existingPosts = await db.select().from(schema.forumPosts).limit(1);
  if (existingPosts.length === 0) {
    const posts = [
      { categoryId: catId["general"], userId: adminId, title: "欢迎来到 API 优选社区", content: "这里是 AI API 中转站聚合与测评社区。\n\n你可以在这里：\n1. 查找并对比各家中转站的稳定性与价格\n2. 分享你的使用体验\n3. 参与福利活动\n\n请遵守社区规范，理性交流。", tags: ["公告"], pinned: true, views: 326 },
      { categoryId: catId["welfare"], userId: stationId, title: "星云 API 新用户注册送 5 元额度", content: "大家好，我是星云 API 的站长。新用户注册即送 5 元体验额度，支持 GPT / Claude / Gemini 全系列。\n\n欢迎在评论区反馈使用体验。", tags: ["送额度", "新站"], pinned: false, views: 158 },
      { categoryId: catId["redeem"], userId: adminId, title: "社区开业兑换码大放送", content: "为庆祝社区开业，我们准备了一批兑换码，前往 SKR 活动页即可领取。\n\n每人限领一次，先到先得。", tags: ["兑换码", "活动"], pinned: true, views: 412 },
      { categoryId: catId["reviews"], userId: demoId, title: "光速中转使用一周体验", content: "用了一周光速中转，GPT 系列延迟确实低，白天基本在 100ms 以内。\n\n晚高峰偶尔有波动，总体可以给 4 星。", tags: ["使用体验"], pinned: false, views: 96 },
      { categoryId: catId["feedback"], userId: demoId, title: "建议增加按延迟排序的功能", content: "希望综合筛选页可以增加按平均延迟排序的选项，方便找低延迟站点。", tags: ["功能建议"], pinned: false, views: 54 },
      { categoryId: catId["general"], userId: demoId, title: "新手求助：如何选择合适的中转站？", content: "刚开始接触 API 中转站，主要用 Claude 写代码，预算有限，请问各位有什么推荐？", tags: ["求助"], pinned: false, views: 78 },
    ];
    for (const p of posts) await db.insert(schema.forumPosts).values({ ...p, content: p.content });

    const allPosts = await db.select().from(schema.forumPosts);
    const welcome = allPosts.find((p) => p.title.includes("欢迎"))!;
    const helpPost = allPosts.find((p) => p.title.includes("新手求助"))!;
    await db.insert(schema.forumComments).values([
      { postId: welcome.id, userId: demoId, content: "支持！希望能越办越好。" },
      { postId: helpPost.id, userId: adminId, content: "建议先到价格筛选页对比 Claude 模型的倍率，再看 30 天稳定性，两者结合选择。" },
      { postId: helpPost.id, userId: stationId, content: "写代码的话推荐选 Claude 专线类站点，稳定性优先于价格。" },
    ]);
    await db.update(schema.forumPosts).set({ commentCount: 1 }).where(eq(schema.forumPosts.id, welcome.id));
    await db.update(schema.forumPosts).set({ commentCount: 2 }).where(eq(schema.forumPosts.id, helpPost.id));
  }

  // ---- 点评 ----
  const existingReviews = await db.select().from(schema.reviews).limit(1);
  if (existingReviews.length === 0) {
    await db.insert(schema.reviews).values([
      { platformId: platformIds[0], userId: demoId, rating: 5, content: "稳定性很好，Claude 通道很少掉线，客服响应也快。" },
      { platformId: platformIds[0], userId: stationId, rating: 4, content: "价格中等偏上，但胜在省心，适合长期用。" },
      { platformId: platformIds[1], userId: demoId, rating: 4, content: "延迟是真的低，就是模型少了点。" },
      { platformId: platformIds[2], userId: adminId, rating: 5, content: "国产模型一站式解决，价格很良心。" },
      { platformId: platformIds[8], userId: demoId, rating: 3, content: "渠道正规但延迟偏高，急性子慎入。" },
    ]);
  }

  // ---- SKR 活动 ----
  const existingActs = await db.select().from(schema.skrActivities).limit(1);
  if (existingActs.length === 0) {
    const now = new Date();
    const later = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    await db.insert(schema.skrActivities).values([
      { creatorId: adminId, title: "社区开业福利 · 每日限量兑换码", description: "API 优选社区开业酬宾，每日限量发放体验兑换码，先到先得。", platformId: platformIds[0], totalCodes: 50, perUserLimit: 1, minRegisterDays: 0, startAt: new Date(now.getTime() - 3600 * 1000), endAt: later, status: "active" },
      { creatorId: stationId, title: "星云 API 站长撒币专场", description: "星云 API 站长福利：本站 5 元额度兑换码，限注册满 1 天的用户领取。", platformId: platformIds[0], totalCodes: 30, perUserLimit: 1, minRegisterDays: 1, startAt: new Date(now.getTime() - 2 * 3600 * 1000), endAt: later, status: "active" },
      { creatorId: adminId, title: "中秋预热 · 定时抢码", description: "定时开抢，活动开始前请耐心等待。", platformId: platformIds[4], totalCodes: 100, perUserLimit: 1, minRegisterDays: 3, startAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000), endAt: new Date(now.getTime() + 10 * 24 * 3600 * 1000), status: "scheduled" },
    ]);
    const acts = await db.select().from(schema.skrActivities);
    const codeRows: schema.InsertSkrCode[] = [];
    const rnd = mulberry32(777);
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (const act of acts) {
      for (let i = 0; i < act.totalCodes; i++) {
        let code = "";
        for (let j = 0; j < 12; j++) { code += chars[Math.floor(rnd() * chars.length)]; if (j % 4 === 3 && j < 11) code += "-"; }
        codeRows.push({ activityId: act.id, code });
      }
    }
    for (let k = 0; k < codeRows.length; k += 200) {
      await db.insert(schema.skrCodes).values(codeRows.slice(k, k + 200));
    }
  }

  console.log("Seed completed.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
