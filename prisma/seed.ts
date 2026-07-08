import "dotenv/config";
import fs from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ensureAntonioDirector,
  importPersonnelFromFile,
} from "../src/services/import/personnel-importer";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const PERSONNEL_FILE =
  process.env.PERSONNEL_FILE ??
  "/Users/xin/Desktop/应用开发/alipay/支付宝作业人员名单.xlsx";

async function main() {
  console.log("Seeding Antonio + personnel...");

  await ensureAntonioDirector("123456");

  await db.systemConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dataMode: "MANUAL_UPLOAD" },
    update: {},
  });

  const division = await db.orgUnit.upsert({
    where: { id: "div-leadspace" },
    create: { id: "div-leadspace", name: "Leadspace 事业部", type: "DIVISION" },
    update: {},
  });

  if (fs.existsSync(PERSONNEL_FILE)) {
    const result = await importPersonnelFromFile(PERSONNEL_FILE);
    console.log("Personnel imported:", result);
  } else {
    console.log("No personnel file, Antonio only.");
  }

  console.log("\nDemo login:");
  console.log("  Antonio / 123456  (管理员，已激活)");
  console.log("  经理/业务员 Excel 导入后无密码，须经理开通账号后方可登录");
  console.log("\nRun: npm run import:all  to import merchant Excel files");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
