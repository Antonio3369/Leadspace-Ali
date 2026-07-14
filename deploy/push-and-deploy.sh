#!/usr/bin/env bash
# 从本机执行：同步代码到服务器并部署
set -euo pipefail

SERVER="${DEPLOY_SERVER:-sales-cloud}"
REMOTE_DIR="/opt/leadspace-alipay"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 同步代码到 ${SERVER}:${REMOTE_DIR}"
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '.env*' \
  --exclude 'src/generated' \
  "${LOCAL_DIR}/" "${SERVER}:${REMOTE_DIR}/"

echo "==> 检查服务器 .env"
ssh "${SERVER}" "bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/leadspace-alipay
if [[ ! -f .env ]]; then
  POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  AUTH_SECRET=$(openssl rand -base64 32)
  cat > .env <<EOF
POSTGRES_USER=leadspace
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=leadspace
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=https://ali.orblead.com
EOF
  echo "已生成 .env（请妥善保存服务器上的密码）"
fi
REMOTE

echo "==> 远程构建并启动..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && chmod +x deploy/server-deploy.sh && ./deploy/server-deploy.sh"

echo "==> 完成。下一步：配置 DNS ali.orblead.com -> 43.136.25.181，然后运行 SSL 配置脚本"
