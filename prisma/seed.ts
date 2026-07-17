import "dotenv/config";
import fs from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ensureAdminDirector,
  importPersonnelFromFile,
} from "../src/services/import/personnel-importer";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const PERSONNEL_FILE =
  process.env.PERSONNEL_FILE ??
  "/Users/xin/Desktop/应用开发/alipay/支付宝作业人员名单.xlsx";

async function main() {
  console.log("Seeding admin + personnel...");

  await ensureAdminDirector("123456");

  await db.systemConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dataMode: "MANUAL_UPLOAD" },
    update: {},
  });

  await db.orgUnit.upsert({
    where: { id: "div-leadspace" },
    create: { id: "div-leadspace", name: "Leadspace 事业部", type: "DIVISION" },
    update: {},
  });

  if (fs.existsSync(PERSONNEL_FILE)) {
    const result = await importPersonnelFromFile(PERSONNEL_FILE);
    console.log("Personnel imported:", result);
  } else {
    console.log("No personnel file, admin only.");
  }

  console.log("\nDemo login:");
  console.log("  admin / 123456  (管理员，已激活)");
  console.log("  经理 Excel 导入后无密码，须在组织管理开通后方可登录");
  console.log("  业务员为纯数据账号，导入即可，不支持登录");
  console.log("\nRun: npm run import:all  to import merchant Excel files");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
