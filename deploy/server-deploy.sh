#!/usr/bin/env bash
# 在服务器 /opt/leadspace-alipay 目录执行
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "缺少 .env，请先：cp deploy/env.production.example .env && 编辑密码与 AUTH_SECRET"
  exit 1
fi

set -a
source .env
set +a

echo "==> 构建并启动容器..."
sudo docker compose -f docker-compose.prod.yml up -d --build

echo "==> 等待数据库就绪..."
sleep 5

echo "==> 同步数据库 schema..."
sudo docker compose -f docker-compose.prod.yml --profile init run --rm \
  --entrypoint sh db-init -c "npx prisma db push"

echo "==> 初始化种子数据（Antonio 管理员）..."
sudo docker compose -f docker-compose.prod.yml --profile init run --rm \
  --entrypoint sh db-init -c "npm run db:seed" || true

echo "==> 部署完成。应用监听 127.0.0.1:3001"
sudo docker compose -f docker-compose.prod.yml ps
