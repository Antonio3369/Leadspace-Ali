#!/usr/bin/env bash
# 安装健康巡检 cron（默认每 10 分钟）
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/leadspace-alipay}"
CRON_SCHEDULE="${CRON_SCHEDULE:-*/10 * * * *}"
CRON_USER="${CRON_USER:-$(whoami)}"
LOG_FILE="${LOG_FILE:-/var/log/leadspace-health-check.log}"
CHECK_SCRIPT="${APP_DIR}/deploy/health-check.sh"
CRON_MARKER="# leadspace-alipay-health-check"

chmod +x "${CHECK_SCRIPT}" "${APP_DIR}/deploy/ops-alert.sh" 2>/dev/null || true

if [[ ! -f "${LOG_FILE}" ]]; then
  sudo touch "${LOG_FILE}"
  sudo chown "${CRON_USER}:${CRON_USER}" "${LOG_FILE}" 2>/dev/null || true
fi

CRON_LINE="${CRON_SCHEDULE} ${CHECK_SCRIPT} >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"

(
  crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" | grep -v "${CHECK_SCRIPT}" || true
  echo "${CRON_LINE}"
) | crontab -

echo "==> 已安装健康巡检"
echo "    计划: ${CRON_SCHEDULE}（每 10 分钟）"
echo "    脚本: ${CHECK_SCRIPT}"
echo "    日志: ${LOG_FILE}"
echo "    告警: 需 .env 配置 XLV_OUTBOUND_WEBHOOK_URL + XLV_OPS_CRON_SECRET"
crontab -l | grep "${CRON_MARKER}" || true
