#!/usr/bin/env bash
# 生产健康巡检：站点 / 容器 / 内存 / 卡死导入 → 紧急告警
# 供 cron 每 10 分钟调用：./deploy/health-check.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ALERT="${APP_DIR}/deploy/ops-alert.sh"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"
MEM_WARN="${HEALTH_MEM_WARN_PCT:-85}"
LOG_TAG="[health-check]"

log() { echo "$(date -Iseconds) ${LOG_TAG} $*"; }

send_alert() {
  local key="$1"
  local title="$2"
  local body="$3"
  if [[ -x "${ALERT}" ]]; then
    bash "${ALERT}" "${title}" "${body}" "${key}" || log "告警发送失败：${title}"
  fi
}

cd "${APP_DIR}"

# 1. 容器是否在跑
if ! sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'leadspace-alipay-app'; then
  send_alert "container_down" "应用容器未运行" "> 状态：leadspace-alipay-app 不在 docker ps 列表\n> 建议：ssh 登录后 \`docker compose -f docker-compose.prod.yml up -d app\`"
  exit 1
fi

# 2. 内存过高（OOM 前兆）
mem_pct="$(
  sudo docker stats leadspace-alipay-app --no-stream --format '{{.MemPerc}}' 2>/dev/null | tr -d '%' || echo "0"
)"
mem_int="${mem_pct%%.*}"
if [[ "${mem_int}" -ge "${MEM_WARN}" ]]; then
  send_alert "mem_high" "内存告警 ${mem_pct}%" "> 容器：leadspace-alipay-app\n> 内存：${mem_pct}（阈值 ${MEM_WARN}%）\n> 说明：接近 OOM，页面可能变慢或 502\n> 可手动：\`/opt/leadspace-alipay/deploy/restart-app.sh\`"
fi

# 3. 站点是否响应
if ! curl -sf -o /dev/null --max-time 8 http://127.0.0.1:3001/login; then
  send_alert "site_down" "站点无法访问" "> 检测：http://127.0.0.1:3001/login 无响应\n> 说明：用户可能看到 502 / 白屏\n> 建议：查看 \`docker logs leadspace-alipay-app --tail 50\`"
  exit 1
fi

# 4. 导入任务卡死（PROCESSING 超过 15 分钟无更新）
stuck="$(
  sudo docker exec leadspace-postgres psql -U leadspace -d leadspace -tAc \
    "SELECT COUNT(*) FROM \"HeavyImportJob\" WHERE status = 'PROCESSING' AND \"updatedAt\" < NOW() - INTERVAL '15 minutes';" \
    2>/dev/null | tr -d ' '
)"
if [[ "${stuck:-0}" -gt 0 ]]; then
  send_alert "import_stuck" "导入任务可能卡死" "> 数量：${stuck} 个 PROCESSING 超过 15 分钟\n> 说明：可能是 OOM 或部署中断\n> 建议：让用户重新上传；查 HeavyImportJob 表"
fi

log "正常（内存 ${mem_pct}%）"
