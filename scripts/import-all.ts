import "dotenv/config";
import fs from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ensureAdminDirector,
  importPersonnelFromFile,
} from "../src/services/import/personnel-importer";
import { importExcelFromPath } from "../src/services/import/excel-importer";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const PERSONNEL_FILE =
  process.env.PERSONNEL_FILE ?? "/Users/xin/Downloads/多码合一作业名单.xlsx";

const MERCHANT_FILES = [
  process.env.MERCHANT_FILE ??
    process.env.MERCHANT_FILE_1 ??
    "/Users/xin/Downloads/小蓝环6.1-6.30数据原表.xlsx",
].filter((f) => f);

async function main() {
  console.log("=== 初始化 admin 管理员 ===");
  const admin = await ensureAdminDirector();
  console.log("Director:", admin.username);

  await db.systemConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dataMode: "MANUAL_UPLOAD" },
    update: {},
  });

  if (fs.existsSync(PERSONNEL_FILE)) {
    console.log("\n=== 导入人员名单 ===");
    const personnel = await importPersonnelFromFile(PERSONNEL_FILE);
    console.log(personnel);
  } else {
    console.warn("跳过人员名单:", PERSONNEL_FILE);
  }

  console.log("\n=== 导入商家明细（全部） ===");
  let totalImported = 0;
  let totalAnomaly = 0;
  let totalSkipped = 0;

  for (const file of MERCHANT_FILES) {
    if (!fs.existsSync(file)) {
      console.warn("跳过不存在:", file);
      continue;
    }
    console.log("导入:", file.split("/").pop());
    const result = await importExcelFromPath(file, admin.id, true);
    console.log(
      `  新增 ${result.createdRows} / 更新 ${result.updatedRows} / 清理 ${result.prunedRows} / 异常 ${result.anomalyRows}`
    );
    totalImported += result.importedRows;
    totalAnomaly += result.anomalyRows;
    totalSkipped += result.skippedRows;
  }

  console.log("\n=== 汇总 ===");
  console.log(`导入成功: ${totalImported}`);
  console.log(`重复跳过: ${totalSkipped}`);
  console.log(`姓名未匹配: ${totalAnomaly}`);

  await db.systemAlert.create({
    data: {
      level: "info",
      message: `批量导入完成：成功 ${totalImported} 条，未匹配 ${totalAnomaly} 条`,
      source: "import",
    },
  });
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
