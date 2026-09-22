#!/bin/bash
# SK-Buy 自动部署脚本：git pull -> 安装依赖 -> （预构建产物直接生效 / 否则服务器构建）-> 迁移 -> 重启
#
# 防并发 + 防脚本执行中被 git 替换：先复制自身到 /tmp 再执行
if [ -z "$DEPLOY_REEXEC" ]; then
  cp "$0" /tmp/sk-buy-deploy-run.sh
  DEPLOY_REEXEC=1 exec bash /tmp/sk-buy-deploy-run.sh "$@"
fi
exec 9>/tmp/sk-buy-deploy.lock
flock -n 9 || { echo "another deploy is running, exit"; exit 0; }

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

# 构建：仓库携带预构建 dist（.prebuilt 标记）时直接使用，避免 1G 内存机器构建 OOM；
# 没有标记时回退到服务器本地构建（先停应用腾内存，失败回滚 dist）
if [ -f .prebuilt ] && [ -f dist/boot.js ]; then
  echo "using prebuilt dist from repo, skip build"
else
  cp -r dist dist.bak 2>/dev/null || true
  pm2 stop sk-buy sk-buy-collector || true
  sync
  if ! NODE_OPTIONS=--max-old-space-size=640 npm run build; then
    echo "[warn] build failed, retry once"
    sleep 3
    if ! NODE_OPTIONS=--max-old-space-size=640 npm run build; then
      echo "[warn] build failed twice, restoring previous dist"
      rm -rf dist && mv dist.bak dist
      pm2 restart sk-buy sk-buy-collector
      pm2 save
      exit 1
    fi
  fi
  rm -rf dist.bak
fi

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
