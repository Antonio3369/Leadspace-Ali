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

echo "==> 启动数据库..."
sudo docker compose -f docker-compose.prod.yml up -d postgres

echo "==> 等待数据库就绪..."
sleep 5

echo "==> 同步数据库 schema（须在新应用接管流量前完成）..."
# 必须重建 db-init（builder 镜像），否则会拿旧 schema 误报 already in sync
sudo docker compose -f docker-compose.prod.yml --profile init build db-init
sudo docker compose -f docker-compose.prod.yml --profile init run --rm \
  --entrypoint sh db-init -c "npx prisma db push"

echo "==> 部署引导（admin 账号迁移 + N7 经理 ID 回填，不重置密码）..."
sudo docker compose -f docker-compose.prod.yml --profile init run --rm \
  --entrypoint sh db-init -c "npm run deploy:bootstrap" || true

if [[ "${RUN_DB_SEED:-0}" == "1" ]]; then
  echo "==> 完整种子（RUN_DB_SEED=1）..."
  sudo docker compose -f docker-compose.prod.yml --profile init run --rm \
    --entrypoint sh db-init -c "npm run db:seed" || true
fi

echo "==> 构建并启动应用..."
sudo docker compose -f docker-compose.prod.yml up -d --build

echo "==> 部署完成。应用监听 127.0.0.1:3001"
echo "    管理员请用账号 admin 登录（原 Antonio 已自动改名，密码不变）"
sudo docker compose -f docker-compose.prod.yml ps
