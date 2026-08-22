/**
 * 手动推送小绿盒分公司排名汇总到负责人群（XLV_OUTBOUND_WEBHOOK_URL）。
 * 用法：npx tsx scripts/xlv-push-company-summary.ts
 */
import "dotenv/config";
import { notifyXlvOutboundCompanyBoardSummary } from "../src/services/xlv/outbound-notifier";

async function main() {
  await notifyXlvOutboundCompanyBoardSummary();
  console.log("[xlv] company board summary pushed (if webhook configured)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
