/**
 * 手动推送小绿盒分公司排名汇总到负责人群（XLV_OUTBOUND_WEBHOOK_URL）。
 * 用法：npx tsx scripts/xlv-push-company-summary.ts
 */
import "dotenv/config";
import {
  notifyXlvOutboundCompanyBoardSummary,
  xlvOutboundWebhookUrl,
} from "../src/services/xlv/outbound-notifier";

async function main() {
  if (!xlvOutboundWebhookUrl()) {
    throw new Error("未配置 XLV_OUTBOUND_WEBHOOK_URL，无法推送负责人群汇总");
  }
  await notifyXlvOutboundCompanyBoardSummary();
  console.log("[xlv] company board summary pushed to business webhook");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
