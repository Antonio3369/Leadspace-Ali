import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureAdminDirector } from "../src/services/import/personnel-importer";
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
