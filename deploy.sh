#!/bin/bash
# SK-Buy 自动部署脚本：git pull -> 安装依赖 -> 构建 -> 结构迁移 -> 重启
set -e
export PATH=/usr/local/bin:$PATH
cd /www/wwwroot/sk-buy

echo "===== $(date '+%F %T') deploy start ====="
OLD=$(git rev-parse HEAD)
git fetch origin main
git reset --hard origin/main

# 仅当 package-lock.json 变化时才重装依赖（避免小内存机器 OOM、缩短部署时间）
# 若 node_modules 损坏（vite 不存在）则强制重装
if [ ! -x node_modules/.bin/vite ]; then
  echo "node_modules broken, running npm ci"
  npm ci --no-audit --no-fund || { echo "npm ci failed, retry after cache clean"; npm cache clean --force; npm ci --no-audit --no-fund; }
elif [ "$OLD" != "$(git rev-parse HEAD)" ] && git diff --name-only "$OLD" HEAD | grep -q '^package-lock.json$'; then
  echo "lockfile changed, running npm ci"
  npm ci --no-audit --no-fund || { echo "npm ci failed, retry after cache clean"; npm cache clean --force; npm ci --no-audit --no-fund; }
else
  echo "skip npm ci (lockfile unchanged)"
fi

# 构建：1G 内存机器上先停应用腾内存、限制构建堆内存；失败则回滚 dist
cp -r dist dist.bak 2>/dev/null || true
pm2 stop sk-buy || true
if ! NODE_OPTIONS=--max-old-space-size=640 npm run build; then
  echo "[warn] build failed, restoring previous dist"
  rm -rf dist && mv dist.bak dist
  pm2 restart sk-buy
  exit 1
fi
rm -rf dist.bak

# 幂等结构迁移（新增字段等）
node scripts/apply-features.cjs

# drizzle 迁移（如有新迁移文件则应用；失败不阻断部署）
npx drizzle-kit migrate || echo "[warn] drizzle migrate skipped/failed"

pm2 restart sk-buy

# 重启采集器（不存在则启动）
if ! pm2 describe sk-buy-collector > /dev/null 2>&1; then
  pm2 start scripts/collector.cjs --name sk-buy-collector
else
  pm2 restart sk-buy-collector
fi
pm2 save

echo "===== $(date '+%F %T') deploy done ====="
