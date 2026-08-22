#!/usr/bin/env bash
# 生产健康巡检：站点可达 + 小绿盒运维 API（内存/导入卡死 → 企微）
# 内存：第一次超阈值只告警；连续两次（约 20 分钟）仍高且无导入才重启
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ALERT="${APP_DIR}/deploy/ops-alert.sh"
RESTART="${APP_DIR}/deploy/restart-app.sh"
MEM_FLAG="${MEM_HIGH_FLAG:-/tmp/leadspace-mem-high}"
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

# 3. 小绿盒运维 API（卡死导入 / 内存 → 运维小群；业务群不收内存）
if [[ -n "${XLV_OPS_CRON_SECRET:-}" ]]; then
  code="$(
    curl -sS -o /tmp/xlv-ops-health.json -w '%{http_code}' \
      --max-time 15 \
      -H "Authorization: Bearer ${XLV_OPS_CRON_SECRET}" \
      "http://127.0.0.1:3001/api/xlv/ops/health" || echo "000"
  )"
  if [[ "${code}" == "200" ]]; then
    rm -f "${MEM_FLAG}"
    log "正常 $(tr -d '\n' < /tmp/xlv-ops-health.json 2>/dev/null | head -c 200)"
  elif [[ "${code}" == "503" ]]; then
    log "有告警 $(cat /tmp/xlv-ops-health.json 2>/dev/null)"
    if grep -q 'memory_high' /tmp/xlv-ops-health.json 2>/dev/null; then
      if [[ -f "${MEM_FLAG}" ]]; then
        active="$(
          sudo docker exec leadspace-postgres psql -U leadspace -d leadspace -tAc \
            "SELECT COUNT(*) FROM \"HeavyImportJob\" WHERE status IN ('PROCESSING', 'PENDING');" \
            2>/dev/null || echo "0"
        )"
        active="${active// /}"
        if [[ "${active}" -gt 0 ]]; then
          log "连续超阈值但有 ${active} 个导入进行中，推迟重启"
        else
          log "连续超阈值，重启 app"
          restart_out="$(bash "${RESTART}" 2>&1)" || true
          log "${restart_out}"
          if echo "${restart_out}" | grep -q '跳过重启'; then
            log "有导入任务，推迟重启"
          elif echo "${restart_out}" | grep -q '完成'; then
            rm -f "${MEM_FLAG}"
            log "连续超阈值已自动重启"
            if [[ -x "${ALERT}" ]]; then
              bash "${ALERT}" "应用已自动重启" "> 原因：连续两次巡检内存超阈值\n> 动作：已重启 leadspace-alipay-app" "auto_restart" || true
            fi
          else
            log "自动重启失败"
            if [[ -x "${ALERT}" ]]; then
              bash "${ALERT}" "自动重启失败" "> 连续内存超阈值后重启未成功，请人工检查" "restart_failed" || true
            fi
          fi
        fi
      else
        date -Iseconds > "${MEM_FLAG}"
        log "内存告警，记一次；下次仍高再重启"
        # 第一次超阈值：由 /api/xlv/ops/health 内推个人；此处 bash 再补一条容器级内存（docker stats）
        mem_line="$(sudo docker stats leadspace-alipay-app --no-stream --format '{{.MemUsage}}' 2>/dev/null || echo '?')"
        if [[ -x "${ALERT}" ]]; then
          bash "${ALERT}" "应用内存过高" "> 容器内存：${mem_line}\n> 下次巡检仍高且无导入将自动重启" "memory_high_host" || true
        fi
      fi
    else
      rm -f "${MEM_FLAG}"
    fi
  else
    log "运维 API 异常 http=${code}"
  fi
else
  log "跳过 XLV 运维 API（未配置 XLV_OPS_CRON_SECRET）"
fi

exit 0
