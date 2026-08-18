/**
 * 一次性补跑：历史撤机（库存已回经理/队员库）但运营态未清零的 SN。
 *
 * 用法：
 *   npx tsx scripts/backfill-xlv-withdraw-ops-clear.ts           # 预览
 *   npx tsx scripts/backfill-xlv-withdraw-ops-clear.ts --apply # 写库
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { clearXlvOperationalStateOnWithdraw } from "../src/services/xlv/inventory/service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const apply = process.argv.includes("--apply");

function hasStaleOps(row: {
  merchantName: string | null;
  activationMerchantName: string | null;
  cumulativeTxns: number;
  cumulativeUsers: number;
  sleepDays: number;
  qualificationStatus: string;
  followUpDone: boolean;
}) {
  if (row.merchantName?.trim()) return true;
  if (row.activationMerchantName?.trim()) return true;
  if (row.cumulativeTxns > 0 || row.cumulativeUsers > 0) return true;
  if (row.sleepDays > 0) return true;
  if (row.qualificationStatus === "qualified") return true;
  if (row.followUpDone) return true;
  return false;
}

async function main() {
  const withdrawnSns = await db.xlvInventoryTransfer.findMany({
    where: { transferType: "withdraw" },
    select: { deviceSn: true },
    distinct: ["deviceSn"],
  });
  const snSet = new Set(withdrawnSns.map((r) => r.deviceSn));

  if (snSet.size === 0) {
    console.log("无撤机流水记录，退出。");
    return;
  }

  const candidates = await db.xlvInventoryDevice.findMany({
    where: {
      deviceSn: { in: [...snSet] },
      status: { in: ["manager_stock", "sales_stock"] },
    },
    select: {
      deviceSn: true,
      status: true,
      managerName: true,
      operatorName: true,
      deviceRecord: {
        select: {
          merchantName: true,
          activationMerchantName: true,
          cumulativeTxns: true,
          cumulativeUsers: true,
          sleepDays: true,
          qualificationStatus: true,
          followUpDone: true,
        },
      },
    },
  });

  const toFix = candidates.filter((c) => c.deviceRecord && hasStaleOps(c.deviceRecord));

  console.log(`模式: ${apply ? "写库 (--apply)" : "预览（加 --apply 才写库）"}`);
  console.log(`撤机流水涉及 SN: ${snSet.size}`);
  console.log(`当前在经理/队员库存: ${candidates.length}`);
  console.log(`运营态仍残留、待清零: ${toFix.length}`);

  if (toFix.length === 0) return;

  console.log("\n样例（最多 20 条）:");
  for (const row of toFix.slice(0, 20)) {
    const d = row.deviceRecord!;
    const store = d.merchantName?.trim() || d.activationMerchantName?.trim() || "—";
    console.log(
      `  ${row.deviceSn} · ${store} · ${row.status} · 经理 ${row.managerName || "—"}`
    );
  }
  if (toFix.length > 20) {
    console.log(`  … 另有 ${toFix.length - 20} 条`);
  }

  if (!apply) {
    console.log("\n确认后执行: npx tsx scripts/backfill-xlv-withdraw-ops-clear.ts --apply");
    return;
  }

  let done = 0;
  for (const row of toFix) {
    await clearXlvOperationalStateOnWithdraw(row.deviceSn);
    done++;
    if (done % 50 === 0) {
      console.log(`已处理 ${done} / ${toFix.length}…`);
    }
  }
  console.log(`\n完成：已清零 ${done} 台运营态。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
