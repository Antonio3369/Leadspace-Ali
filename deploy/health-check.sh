#!/usr/bin/env bash
# 生产健康巡检：站点可达 + 小绿盒运维 API（内存/导入卡死 → 企微）
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ALERT="${APP_DIR}/deploy/ops-alert.sh"
LOG_TAG="[health-check]"

log() { echo "$(date -Iseconds) ${LOG_TAG} $*"; }

cd "${APP_DIR}"

if [[ -f "${APP_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${APP_DIR}/.env"
  set +a
fi

# 1. 容器是否在跑
if ! sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'leadspace-alipay-app'; then
  if [[ -x "${ALERT}" ]]; then
    bash "${ALERT}" "应用容器未运行" "> 状态：leadspace-alipay-app 不在运行\n> 建议：docker compose up -d app" "container_down" || true
  fi
  exit 1
fi

# 2. 站点是否响应
if ! curl -sf -o /dev/null --max-time 8 http://127.0.0.1:3001/login; then
  if [[ -x "${ALERT}" ]]; then
    bash "${ALERT}" "站点无法访问" "> /login 无响应\n> 用户可能看到 502 / 白屏" "site_down" || true
  fi
  exit 1
fi

# 3. 小绿盒运维 API（进程内存 / 卡死导入 → 企微，走 XLV_OUTBOUND_WEBHOOK_URL）
if [[ -n "${XLV_OPS_CRON_SECRET:-}" ]]; then
  code="$(
    curl -sS -o /tmp/xlv-ops-health.json -w '%{http_code}' \
      --max-time 15 \
      -H "Authorization: Bearer ${XLV_OPS_CRON_SECRET}" \
      "http://127.0.0.1:3001/api/xlv/ops/health" || echo "000"
  )"
  if [[ "${code}" == "200" ]]; then
    log "正常 $(tr -d '\n' < /tmp/xlv-ops-health.json 2>/dev/null | head -c 200)"
  elif [[ "${code}" == "503" ]]; then
    log "有告警 $(cat /tmp/xlv-ops-health.json 2>/dev/null)"
  else
    log "运维 API 异常 http=${code}"
  fi
else
  log "跳过 XLV 运维 API（未配置 XLV_OPS_CRON_SECRET）"
fi

exit 0
