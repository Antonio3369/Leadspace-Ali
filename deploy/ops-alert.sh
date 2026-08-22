#!/usr/bin/env bash
# 站点级紧急告警（容器挂了 / login 不通）
# 优先：企微自建应用推个人（WECOM_*）；其次群 Webhook
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${OPS_ALERT_STATE_DIR:-/tmp/leadspace-ops}"
COOLDOWN_SEC="${OPS_ALERT_COOLDOWN_SEC:-1800}"

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

if [[ -f "${APP_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${APP_DIR}/.env"
  set +a
fi

content="$(cat <<EOF
**【Leadspace 运维 · ${title}】**
> 时间：$(date '+%Y-%m-%d %H:%M:%S %Z')
> 主机：$(hostname -s 2>/dev/null || echo sales-cloud)
${body}
> 站点：https://ali.orblead.com
EOF
)"

send_via_app() {
  local corp_id="${WECOM_CORP_ID:-}"
  local agent_id="${WECOM_AGENT_ID:-}"
  local secret="${WECOM_AGENT_SECRET:-}"
  local touser="${WECOM_OPS_USERID:-}"
  if [[ -z "${corp_id}" || -z "${agent_id}" || -z "${secret}" || -z "${touser}" ]]; then
    return 1
  fi

  local token_json token
  token_json="$(
    curl -sS --max-time 10 \
      "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corp_id}&corpsecret=${secret}" || true
  )"
  token="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' <<< "${token_json}" 2>/dev/null || true)"
  if [[ -z "${token}" ]]; then
    echo "$(date -Iseconds) [ops-alert] 应用消息 gettoken 失败"
    return 1
  fi

  local payload
  payload="$(
    WECOM_TOUSER="${touser}" WECOM_AGENT_ID="${agent_id}" python3 -c '
import json, os, sys
print(json.dumps({
  "touser": os.environ["WECOM_TOUSER"],
  "msgtype": "markdown",
  "agentid": int(os.environ["WECOM_AGENT_ID"]),
  "markdown": {"content": sys.stdin.read()},
  "enable_duplicate_check": 1,
  "duplicate_check_interval": 1800,
}, ensure_ascii=False))
' <<< "${content}"
  )"

  local http_code
  http_code="$(
    curl -sS -o /tmp/leadspace-ops-alert-resp.txt -w '%{http_code}' \
      --max-time 10 \
      -X POST -H 'Content-Type: application/json; charset=utf-8' \
      -d "${payload}" \
      "https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}" || echo "000"
  )"
  if [[ "${http_code}" != "200" ]]; then
    echo "$(date -Iseconds) [ops-alert] 应用消息 http=${http_code}"
    return 1
  fi
  local errcode
  errcode="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("errcode",1))' < /tmp/leadspace-ops-alert-resp.txt 2>/dev/null || echo 1)"
  if [[ "${errcode}" != "0" ]]; then
    echo "$(date -Iseconds) [ops-alert] 应用消息失败 $(head -c 200 /tmp/leadspace-ops-alert-resp.txt)"
    return 1
  fi
  return 0
}

send_via_webhook() {
  local webhook=""
  for key in OPS_ALERT_WEBHOOK_URL XLV_OUTBOUND_WEBHOOK_URL N7_OUTBOUND_WEBHOOK_URL; do
    webhook="${!key:-}"
    [[ -n "${webhook}" ]] && break
  done
  if [[ -z "${webhook}" ]]; then
    return 1
  fi
  local payload
  payload="$(python3 -c 'import json,sys; print(json.dumps({"msgtype":"markdown","markdown":{"content":sys.stdin.read()}}, ensure_ascii=False))' <<< "${content}")"
  local http_code
  http_code="$(
    curl -sS -o /tmp/leadspace-ops-alert-resp.txt -w '%{http_code}' \
      -X POST -H 'Content-Type: application/json; charset=utf-8' \
      -d "${payload}" \
      "${webhook}" || echo "000"
  )"
  [[ "${http_code}" == "200" ]]
}

if send_via_app; then
  echo "${now_epoch}" > "${state_file}"
  echo "$(date -Iseconds) [ops-alert] 已推个人应用：${title}"
  exit 0
fi

if send_via_webhook; then
  echo "${now_epoch}" > "${state_file}"
  echo "$(date -Iseconds) [ops-alert] 已推群 Webhook：${title}"
  exit 0
fi

echo "$(date -Iseconds) [ops-alert] 未配置 WECOM_* / Webhook，仅日志：${title}"
echo "${content}"
exit 0
