#!/bin/bash
# SK-Buy 自动部署脚本：git pull -> 安装依赖 -> 构建 -> 结构迁移 -> 重启
set -e
export PATH=/usr/local/bin:$PATH
cd /www/wwwroot/sk-buy

echo "===== $(date '+%F %T') deploy start ====="
git fetch origin main
git reset --hard origin/main

npm ci --no-audit --no-fund
npm run build

# 幂等结构迁移（新增字段等）
node scripts/apply-features.cjs

# drizzle 迁移（如有新迁移文件则应用；失败不阻断部署）
npx drizzle-kit migrate || echo "[warn] drizzle migrate skipped/failed"

pm2 restart sk-buy

# 确保采集器在运行（每小时探测 + 评分重算）
if ! pm2 describe sk-buy-collector > /dev/null 2>&1; then
  pm2 start scripts/collector.cjs --name sk-buy-collector
fi
pm2 save

echo "===== $(date '+%F %T') deploy done ====="
