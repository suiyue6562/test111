import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  int,
  bigint,
  decimal,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  json,
} from "drizzle-orm/mysql-core";

// ---------- 用户 ----------
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  status: mysqlEnum("status", ["active", "banned"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ---------- 平台（API 中转站） ----------
export const platforms = mysqlTable(
  "platforms",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    domain: varchar("domain", { length: 255 }).notNull().unique(),
    url: varchar("url", { length: 512 }).notNull(),
    apiBaseUrl: varchar("apiBaseUrl", { length: 512 }),
    description: text("description"),
    vendors: json("vendors").$type<string[]>().notNull(), // ["OpenAI","Claude",...]
    tags: json("tags").$type<string[]>().notNull(),
    status: mysqlEnum("status", ["operational", "slow", "down", "unknown"])
      .default("unknown")
      .notNull(),
    stage: mysqlEnum("stage", ["new", "stable", "watch", "closed"])
      .default("new")
      .notNull(),
    featured: boolean("featured").default(false).notNull(),
    visitCount: int("visitCount").default(0).notNull(),
    ownerId: bigint("ownerId", { mode: "number", unsigned: true }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    statusIdx: index("platform_status_idx").on(t.status),
    featuredIdx: index("platform_featured_idx").on(t.featured),
  }),
);

export type Platform = typeof platforms.$inferSelect;
export type InsertPlatform = typeof platforms.$inferInsert;

// ---------- 平台每日监控 ----------
export const platformDailyStatus = mysqlTable(
  "platform_daily_status",
  {
    id: serial("id").primaryKey(),
    platformId: bigint("platformId", { mode: "number", unsigned: true }).notNull(),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    status: mysqlEnum("status", ["ok", "slow", "down", "nodata"])
      .default("nodata")
      .notNull(),
    latencyMs: int("latencyMs"),
  },
  (t) => ({
    uniq: uniqueIndex("pds_platform_date_uniq").on(t.platformId, t.date),
  }),
);

export type PlatformDailyStatus = typeof platformDailyStatus.$inferSelect;

// ---------- 平台模型价格 ----------
export const platformPrices = mysqlTable(
  "platform_prices",
  {
    id: serial("id").primaryKey(),
    platformId: bigint("platformId", { mode: "number", unsigned: true }).notNull(),
    vendor: varchar("vendor", { length: 64 }).notNull(), // OpenAI / Claude ...
    model: varchar("model", { length: 128 }).notNull(),
    groupName: varchar("groupName", { length: 64 }).default("default").notNull(),
    ratio: decimal("ratio", { precision: 10, scale: 4 }).notNull(), // 人民币倍率
    shortCost: decimal("shortCost", { precision: 10, scale: 4 }).notNull(), // 预估短文花费 ￥/次
    longCost: decimal("longCost", { precision: 10, scale: 4 }).notNull(), // 预估长文花费 ￥/次
  },
  (t) => ({
    modelIdx: index("price_model_idx").on(t.vendor, t.model),
    platformIdx: index("price_platform_idx").on(t.platformId),
  }),
);

export type PlatformPrice = typeof platformPrices.$inferSelect;

// ---------- 站点点评 ----------
export const reviews = mysqlTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    platformId: bigint("platformId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    rating: int("rating").notNull(), // 1-5
    content: text("content").notNull(),
    status: mysqlEnum("status", ["published", "hidden"])
      .default("published")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    platformIdx: index("review_platform_idx").on(t.platformId),
  }),
);

export type Review = typeof reviews.$inferSelect;

// ---------- 论坛 ----------
export const forumCategories = mysqlTable("forum_categories", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 64 }).notNull(),
  description: varchar("description", { length: 255 }),
  sort: int("sort").default(0).notNull(),
});

export type ForumCategory = typeof forumCategories.$inferSelect;

export const forumPosts = mysqlTable(
  "forum_posts",
  {
    id: serial("id").primaryKey(),
    categoryId: bigint("categoryId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    tags: json("tags").$type<string[]>().notNull(),
    views: int("views").default(0).notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    status: mysqlEnum("status", ["published", "hidden"])
      .default("published")
      .notNull(),
    commentCount: int("commentCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    catIdx: index("post_category_idx").on(t.categoryId),
  }),
);

export type ForumPost = typeof forumPosts.$inferSelect;

export const forumComments = mysqlTable(
  "forum_comments",
  {
    id: serial("id").primaryKey(),
    postId: bigint("postId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    content: text("content").notNull(),
    status: mysqlEnum("status", ["published", "hidden"])
      .default("published")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    postIdx: index("comment_post_idx").on(t.postId),
  }),
);

export type ForumComment = typeof forumComments.$inferSelect;

// ---------- SKS 收录申请 ----------
export const sksSubmissions = mysqlTable(
  "sks_submissions",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    url: varchar("url", { length: 512 }).notNull(),
    apiKeyMasked: varchar("apiKeyMasked", { length: 128 }).notNull(),
    apiKeyEnc: text("apiKeyEnc"), // 简单保存（演示）
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    platformId: bigint("platformId", { mode: "number", unsigned: true }),
    reviewNote: varchar("reviewNote", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    reviewedAt: timestamp("reviewedAt"),
  },
  (t) => ({
    userIdx: index("sks_user_idx").on(t.userId),
  }),
);

export type SksSubmission = typeof sksSubmissions.$inferSelect;

// ---------- SKR 发码活动 ----------
export const skrActivities = mysqlTable("skr_activities", {
  id: serial("id").primaryKey(),
  creatorId: bigint("creatorId", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  platformId: bigint("platformId", { mode: "number", unsigned: true }),
  totalCodes: int("totalCodes").notNull(),
  perUserLimit: int("perUserLimit").default(1).notNull(),
  minRegisterDays: int("minRegisterDays").default(0).notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt"),
  status: mysqlEnum("status", ["scheduled", "active", "ended"])
    .default("scheduled")
    .notNull(),
  postId: bigint("postId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SkrActivity = typeof skrActivities.$inferSelect;

export const skrCodes = mysqlTable(
  "skr_codes",
  {
    id: serial("id").primaryKey(),
    activityId: bigint("activityId", { mode: "number", unsigned: true }).notNull(),
    code: varchar("code", { length: 64 }).notNull().unique(),
    claimedBy: bigint("claimedBy", { mode: "number", unsigned: true }),
    claimedAt: timestamp("claimedAt"),
  },
  (t) => ({
    actIdx: index("code_activity_idx").on(t.activityId),
    claimIdx: index("code_claimed_idx").on(t.claimedBy),
  }),
);

export type SkrCode = typeof skrCodes.$inferSelect;

// ---------- 收藏 ----------
export const favorites = mysqlTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    platformId: bigint("platformId", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("fav_user_platform_uniq").on(t.userId, t.platformId),
  }),
);

export type Favorite = typeof favorites.$inferSelect;

// ---------- 访问跳转记录 ----------
export const visitLogs = mysqlTable(
  "visit_logs",
  {
    id: serial("id").primaryKey(),
    platformId: bigint("platformId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    platformIdx: index("visit_platform_idx").on(t.platformId),
  }),
);

export type VisitLog = typeof visitLogs.$inferSelect;

export type InsertPlatformPrice = typeof platformPrices.$inferInsert;
export type InsertSkrCode = typeof skrCodes.$inferInsert;
