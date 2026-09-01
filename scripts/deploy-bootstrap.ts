import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureAdminDirector } from "../src/services/import/personnel-importer";
import { relinkN7SalesDevices } from "../src/services/n7/relink-sales-devices";
import {
  buildUserLookupIndexes,
  findManagerInIndexes,
} from "../src/services/org/user-matcher";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

/**
 * 部署后轻量引导：
 * 1. 管理员 Antonio → admin（不改密码）
 * 2. 回填 N7 设备的 managerUserId，减少重名串数
 * 3. 按「姓名+经理」重挂队员设备（对齐沙箱）
 */
export async function backfillN7ManagerUserIds() {
  const indexes = await buildUserLookupIndexes();
  const devices = await db.n7DeviceRecord.findMany({
    where: { managerUserId: null },
    select: { id: true, managerName: true },
  });

  let updated = 0;
  let unmatched = 0;

  for (const device of devices) {
    const manager = findManagerInIndexes(indexes, device.managerName);
    if (!manager) {
      unmatched += 1;
      continue;
    }
    await db.n7DeviceRecord.update({
      where: { id: device.id },
      data: { managerUserId: manager.id },
    });
    updated += 1;
  }

  return { scanned: devices.length, updated, unmatched };
}

async function main() {
  console.log("==> 确保管理员账号为 admin...");
  const admin = await ensureAdminDirector();
  console.log("   ", admin.username);

  console.log("==> 回填 N7 设备所属经理 ID...");
  const result = await backfillN7ManagerUserIds();
  console.log(
    `    扫描 ${result.scanned}，回填 ${result.updated}，未匹配 ${result.unmatched}`
  );

  console.log("==> 按姓名+经理重挂 N7 队员设备...");
  const relink = await relinkN7SalesDevices();
  console.log(
    `    重挂 ${relink.totalRelinked} 台，停用孤儿旧号 ${relink.disabledOrphans}`
  );

  console.log("==> 回填小绿盒移机考核起算日...");
  const { backfillXlvRelocatedAtFromTransfers } = await import(
    "../src/services/xlv/relocation"
  );
  const relocated = await backfillXlvRelocatedAtFromTransfers();
  console.log(`    扫描流水 ${relocated.scanned}，回填 ${relocated.devices} 台`);
  if (relocated.deviceSns.length > 0) {
    const { recomputeXlvQualificationForDevices } = await import(
      "../src/services/xlv/recompute-qualification"
    );
    await recomputeXlvQualificationForDevices(relocated.deviceSns);
    console.log(`    已重算移机设备考核 ${relocated.deviceSns.length} 台`);
  }

  console.log("==> 回填小绿盒考核状态（未评估 + 旧两月窗口无效设备）...");
  const { backfillXlvQualificationIfNeeded } = await import(
    "../src/services/xlv/recompute-qualification"
  );
  const xlv = await backfillXlvQualificationIfNeeded();
  console.log(`    已评估 ${xlv.updated} 台`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
