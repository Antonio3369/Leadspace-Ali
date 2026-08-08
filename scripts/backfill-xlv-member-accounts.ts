/**
 * 从库内 XlvTeamRoster 为小绿盒经理/作业员补开登录账号。
 * 用法: npx tsx scripts/backfill-xlv-member-accounts.ts
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { backfillXlvMemberAccountsFromStoredRoster } from "../src/services/xlv/member-accounts";

async function main() {
  const result = await backfillXlvMemberAccountsFromStoredRoster();
  console.log(
    `名册 ${result.rosterRows} 行 → 新开 ${result.created}，补开通 ${result.updated}，跳过 ${result.skipped}，修正登录名 ${result.renamed}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await createPrismaClient().$disconnect();
  });
