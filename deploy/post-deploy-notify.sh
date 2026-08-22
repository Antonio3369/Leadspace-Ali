#!/usr/bin/env bash
# 部署成功后：运维小群发更新说明 + 负责人群发最新分公司汇总
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

COMMIT="${1:-unknown}"
TITLE="${2:-部署成功}"
BODY="${3:-}"

if [[ -z "${BODY}" ]]; then
  BODY="> 版本：${COMMIT}
> 小绿盒更新：
> · 管理员分公司排名看板 /xlv/admin/companies
> · 企微：导入结果 → 运维小群；SN 归属成功后 → 负责人群分公司汇总
> · 系统通知分栏（经理/队员）；全部标已读按类型
> · 撤机待确认通知停用；跟进/撤机不再推业务群"
fi

echo "==> 运维小群：${TITLE}"
bash "${APP_DIR}/deploy/ops-alert.sh" "${TITLE}" "${BODY}" "deploy_${COMMIT}"

echo "==> 负责人群：分公司排名汇总"
if [[ -z "${XLV_OUTBOUND_WEBHOOK_URL:-}" ]]; then
  echo "ERROR: .env 未配置 XLV_OUTBOUND_WEBHOOK_URL，跳过负责人群汇总" >&2
  exit 1
fi

sudo docker compose -f docker-compose.prod.yml --profile init run --rm \
  --entrypoint sh db-init -c "npx tsx scripts/xlv-push-company-summary.ts"

echo "==> 企微推送完成"
