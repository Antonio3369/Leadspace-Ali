/**
 * 将 N7 设备挂到「经理本队队员」帐号上（姓名 + 所属经理）
 * 用法: npx tsx scripts/relink-n7-sales-devices.ts
 */
import "dotenv/config";
import { relinkN7SalesDevices } from "../src/services/n7/relink-sales-devices";
import { db } from "../src/lib/db";

async function main() {
  const result = await relinkN7SalesDevices();
  console.log("relinked rows", result.totalRelinked);
  console.log("disabled orphans", result.disabledOrphans);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
