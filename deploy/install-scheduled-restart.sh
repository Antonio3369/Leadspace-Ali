#!/usr/bin/env bash
# 安装 / 更新定时重启 cron（在服务器上执行，或本机：ssh sales-cloud 'bash -s' < deploy/install-scheduled-restart.sh）
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/leadspace-alipay}"
# 默认每天 03:00（Asia/Shanghai，业务低峰）
CRON_SCHEDULE="${CRON_SCHEDULE:-0 3 * * *}"
CRON_USER="${CRON_USER:-$(whoami)}"
LOG_FILE="${LOG_FILE:-/var/log/leadspace-restart.log}"
RESTART_SCRIPT="${APP_DIR}/deploy/restart-app.sh"
CRON_MARKER="# leadspace-alipay-scheduled-restart"

if [[ ! -x "${RESTART_SCRIPT}" ]]; then
  chmod +x "${RESTART_SCRIPT}"
fi

# 确保日志文件可写
if [[ ! -f "${LOG_FILE}" ]]; then
  sudo touch "${LOG_FILE}"
  sudo chown "${CRON_USER}:${CRON_USER}" "${LOG_FILE}" 2>/dev/null || true
fi

CRON_LINE="${CRON_SCHEDULE} ${RESTART_SCRIPT} >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"

# 去掉旧条目后写入新条目
(
  crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" || true
  echo "${CRON_LINE}"
) | crontab -

echo "==> 已安装定时重启"
echo "    用户: ${CRON_USER}"
echo "    计划: ${CRON_SCHEDULE}（服务器本地时区：$(date +%Z)）"
echo "    脚本: ${RESTART_SCRIPT}"
echo "    日志: ${LOG_FILE}"
echo ""
echo "当前 crontab："
crontab -l | grep "${CRON_MARKER}" || true
