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
ssh "${SERVER}" "chmod +x ${REMOTE_DIR}/deploy/*.sh && cd ${REMOTE_DIR} && ./deploy/server-deploy.sh"

COMMIT="$(git -C "${LOCAL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "==> 运维小群：部署成功 ${COMMIT}"
ssh "${SERVER}" "cd ${REMOTE_DIR} && ./deploy/ops-alert.sh 部署成功 $(printf '%q' "> 版本：${COMMIT}
> 站点已更新，见 https://ali.orblead.com") deploy_${COMMIT}"

echo "==> 完成。下一步：配置 DNS ali.orblead.com -> 43.136.25.181，然后运行 SSL 配置脚本"
