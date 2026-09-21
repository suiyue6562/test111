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
  ];
  for (const [col, sql] of adds) {
    if (await columnExists(conn, "platforms", col)) {
      console.log(`[migrate] platforms.${col} 已存在，跳过`);
    } else {
      await conn.query(sql);
      console.log(`[migrate] platforms.${col} 已添加`);
    }
  }
  await conn.end();
  console.log("[migrate] done");
}

main().catch((e) => {
  console.error("[migrate] failed:", e.message);
  process.exit(1);
});
