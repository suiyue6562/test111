#!/usr/bin/env node
/**
 * 幂等结构迁移：为 platforms 表增加 score / isAd / adWeight / adExpireAt 字段。
 * 每次部署自动执行（见 deploy.sh），重复执行无副作用。
 */
require("dotenv/config");
const mysql = require("mysql2/promise");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column],
  );
  return rows[0].n > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const conn = await mysql.createConnection(url);

  const adds = [
    ["score", "ALTER TABLE platforms ADD COLUMN score DECIMAL(8,3) NOT NULL DEFAULT 0 AFTER visitCount"],
    ["isAd", "ALTER TABLE platforms ADD COLUMN isAd TINYINT(1) NOT NULL DEFAULT 0 AFTER score"],
    ["adWeight", "ALTER TABLE platforms ADD COLUMN adWeight INT NOT NULL DEFAULT 0 AFTER isAd"],
    ["adExpireAt", "ALTER TABLE platforms ADD COLUMN adExpireAt TIMESTAMP NULL DEFAULT NULL AFTER adWeight"],
    ["autoClosed", "ALTER TABLE platforms ADD COLUMN autoClosed TINYINT(1) NOT NULL DEFAULT 0 AFTER adExpireAt"],
    ["apiConfirmed", "ALTER TABLE platforms ADD COLUMN apiConfirmed TINYINT(1) NOT NULL DEFAULT 0 AFTER autoClosed"],
    ["lastProbeAt", "ALTER TABLE platforms ADD COLUMN lastProbeAt TIMESTAMP NULL DEFAULT NULL AFTER apiConfirmed"],
    ["lastProbeLatency", "ALTER TABLE platforms ADD COLUMN lastProbeLatency INT NULL DEFAULT NULL AFTER lastProbeAt"],
    ["priceFailCount", "ALTER TABLE platforms ADD COLUMN priceFailCount INT NOT NULL DEFAULT 0 AFTER lastProbeLatency"],
    ["priceStale", "ALTER TABLE platforms ADD COLUMN priceStale TINYINT(1) NOT NULL DEFAULT 0 AFTER priceFailCount"],
  ];
  for (const [col, sql] of adds) {
    if (await columnExists(conn, "platforms", col)) {
      console.log(`[migrate] platforms.${col} 已存在，跳过`);
    } else {
      await conn.query(sql);
      console.log(`[migrate] platforms.${col} 已添加`);
    }
  }

  // visit_logs.source：点击来源（ad-home / ad-list 为广告位点击）
  if (await columnExists(conn, "visit_logs", "source")) {
    console.log("[migrate] visit_logs.source 已存在，跳过");
  } else {
    await conn.query("ALTER TABLE visit_logs ADD COLUMN source VARCHAR(20) NULL DEFAULT NULL AFTER userId");
    console.log("[migrate] visit_logs.source 已添加");
  }

  // ad_impressions：广告曝光埋点
  await conn.query(`CREATE TABLE IF NOT EXISTS ad_impressions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    platformId BIGINT UNSIGNED NOT NULL,
    position VARCHAR(20) NOT NULL,
    userId BIGINT UNSIGNED NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX adimp_platform_idx (platformId),
    INDEX adimp_created_idx (createdAt)
  )`);
  console.log("[migrate] ad_impressions 已就绪");

  // ad_campaigns：广告位活动（顶部/底部/左侧/右侧/弹窗）
  await conn.query(`CREATE TABLE IF NOT EXISTS ad_campaigns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    platformId BIGINT UNSIGNED NOT NULL,
    position ENUM('top','bottom','left','right','popup') NOT NULL,
    weight INT NOT NULL DEFAULT 0,
    expireAt TIMESTAMP NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX adc_platform_idx (platformId),
    INDEX adc_position_idx (position)
  )`);
  console.log("[migrate] ad_campaigns 已就绪");

  // ad_inquiries：广告合作申请（招商页表单）
  await conn.query(`CREATE TABLE IF NOT EXISTS ad_inquiries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    contact VARCHAR(200) NOT NULL,
    positions JSON NOT NULL,
    message TEXT,
    status ENUM('pending','contacted','deal','closed') NOT NULL DEFAULT 'pending',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("[migrate] ad_inquiries 已就绪");

  // platform_probes：每次探测的原始记录（卡片展示"最近 12 次状态"）
  await conn.query(`CREATE TABLE IF NOT EXISTS platform_probes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    platformId BIGINT UNSIGNED NOT NULL,
    status ENUM('ok','slow','down','nodata') NOT NULL,
    latencyMs INT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX pp_platform_idx (platformId, id)
  )`);
  console.log("[migrate] platform_probes 已就绪");
  await conn.end();
  console.log("[migrate] done");
}

main().catch((e) => {
  console.error("[migrate] failed:", e.message);
  process.exit(1);
});

