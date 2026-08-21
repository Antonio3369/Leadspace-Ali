#!/usr/bin/env bash
# 运维紧急告警 → 企微群机器人 Webhook
# 用法：./deploy/ops-alert.sh "标题" "详情 markdown 行"
# 未配置 OPS_ALERT_WEBHOOK_URL（或 N7_OUTBOUND_WEBHOOK_URL）时只写日志，不报错
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${OPS_ALERT_STATE_DIR:-/var/log/leadspace-ops}"
COOLDOWN_SEC="${OPS_ALERT_COOLDOWN_SEC:-1800}"  # 同类告警默认 30 分钟内不重复

title="${1:-运维告警}"
body="${2:-}"
alert_key="${3:-${title}}"

mkdir -p "${STATE_DIR}"
state_file="${STATE_DIR}/$(echo "${alert_key}" | tr -cs 'a-zA-Z0-9_' '_').last"

now_epoch="$(date +%s)"
if [[ -f "${state_file}" ]]; then
  last="$(cat "${state_file}" 2>/dev/null || echo 0)"
  if [[ $((now_epoch - last)) -lt "${COOLDOWN_SEC}" ]]; then
    echo "$(date -Iseconds) [ops-alert] 冷却中，跳过：${alert_key}"
    exit 0
  fi
fi

webhook=""
if [[ -f "${APP_DIR}/.env" ]]; then
  webhook="$(
    grep -E '^OPS_ALERT_WEBHOOK_URL=' "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true
  )"
  if [[ -z "${webhook}" ]]; then
    webhook="$(
      grep -E '^N7_OUTBOUND_WEBHOOK_URL=' "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true
    )"
  fi
fi

content="$(cat <<EOF
**【Leadspace 运维 · ${title}】**
> 时间：$(date '+%Y-%m-%d %H:%M:%S %Z')
> 主机：$(hostname -s 2>/dev/null || echo sales-cloud)
${body}
> 站点：https://ali.orblead.com
EOF
)"

if [[ -z "${webhook}" ]]; then
  echo "$(date -Iseconds) [ops-alert] 未配置 Webhook，仅日志：${title}"
  echo "${content}"
  exit 0
fi

payload="$(python3 -c 'import json,sys; print(json.dumps({"msgtype":"markdown","markdown":{"content":sys.stdin.read()}}))' <<< "${content}")"

http_code="$(
  curl -sS -o /tmp/leadspace-ops-alert-resp.txt -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' \
    -d "${payload}" \
    "${webhook}" || echo "000"
)"

if [[ "${http_code}" != "200" ]]; then
  echo "$(date -Iseconds) [ops-alert] 发送失败 http=${http_code} $(head -c 200 /tmp/leadspace-ops-alert-resp.txt 2>/dev/null)"
  exit 1
fi

echo "${now_epoch}" > "${state_file}"
echo "$(date -Iseconds) [ops-alert] 已发送：${title}"
