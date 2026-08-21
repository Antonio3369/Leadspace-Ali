#!/usr/bin/env bash
# 在服务器 /opt/leadspace-alipay 执行：仅重启应用容器（不动 postgres）
# 供 cron 定时调用，或手动：./deploy/restart-app.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"
LOG_TAG="[leadspace-restart]"

log() {
  echo "$(date -Iseconds) ${LOG_TAG} $*"
}

cd "${APP_DIR}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  log "错误：找不到 ${COMPOSE_FILE}"
  exit 1
fi

# 默认：有进行中的大表导入则跳过，避免打断任务（§15.7）
if [[ "${SKIP_IF_IMPORT:-1}" == "1" ]]; then
  active="$(
    sudo docker exec leadspace-postgres psql -U leadspace -d leadspace -tAc \
      "SELECT COUNT(*) FROM \"HeavyImportJob\" WHERE status IN ('PROCESSING', 'PENDING');" \
      2>/dev/null || echo "0"
  )"
  active="${active// /}"
  if [[ "${active}" -gt 0 ]]; then
    log "跳过重启：${active} 个导入任务进行中"
    exit 0
  fi
fi

before_mem="$(
  sudo docker stats leadspace-alipay-app --no-stream --format '{{.MemPerc}}' 2>/dev/null || echo "?"
)"

log "开始重启 leadspace-alipay-app（重启前内存 ${before_mem}）"
sudo docker compose -f "${COMPOSE_FILE}" restart app

# 等待健康：最多 30s
for _ in $(seq 1 15); do
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:3001/login; then
    after_mem="$(
      sudo docker stats leadspace-alipay-app --no-stream --format '{{.MemPerc}}' 2>/dev/null || echo "?"
    )"
    log "完成，/login 已响应（重启后内存 ${after_mem}）"
    exit 0
  fi
  sleep 2
done

log "警告：重启后 30s 内 /login 未响应，请人工检查"
exit 1
