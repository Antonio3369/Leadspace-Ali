import "dotenv/config";
import fs from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ensureAntonioDirector,
  importPersonnelFromFile,
} from "../src/services/import/personnel-importer";
import { importExcelFromPath } from "../src/services/import/excel-importer";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const resetPersonnel = args.includes("--personnel");
const reimport = args.includes("--reimport");

const PERSONNEL_FILE =
  process.env.PERSONNEL_FILE ?? "/Users/xin/Downloads/多码合一作业名单.xlsx";

const MERCHANT_FILES = [
  process.env.MERCHANT_FILE ??
    process.env.MERCHANT_FILE_1 ??
    "/Users/xin/Downloads/小蓝环6.1-6.30数据原表.xlsx",
].filter(Boolean);

function printUsage() {
  console.log(`
用法: npm run import:reset -- --confirm [选项]

选项:
  --confirm     必填，确认执行删除
  --personnel   同时清空经理/业务员/组织/PID 身份（保留 Antonio 总监）
  --reimport    重置完成后自动导入人员名单 + 商户明细

示例:
  npm run import:reset -- --confirm
  npm run import:reset -- --confirm --personnel --reimport
`);
}

async function countSnapshot() {
  const [merchants, anomalies, importLogs, opportunities, sales, managers, identities, teams] =
    await Promise.all([
      db.merchantRecord.count(),
      db.anomalyRecord.count(),
      db.importLog.count(),
      db.opportunity.count(),
      db.user.count({ where: { role: "SALES" } }),
      db.user.count({ where: { role: "MANAGER" } }),
      db.salesPlatformIdentity.count(),
      db.orgUnit.count({ where: { type: "TEAM" } }),
    ]);
  return { merchants, anomalies, importLogs, opportunities, sales, managers, identities, teams };
}

async function resetMerchantData() {
  const merchants = await db.merchantRecord.deleteMany();
  const anomalies = await db.anomalyRecord.deleteMany();
  const importLogs = await db.importLog.deleteMany();
  const apiSyncLogs = await db.apiSyncLog.deleteMany();
  const alerts = await db.systemAlert.deleteMany({
    where: { source: { in: ["import", "api"] } },
  });
  const opportunities = await db.opportunity.deleteMany();
  return { merchants, anomalies, importLogs, apiSyncLogs, alerts, opportunities };
}

async function resetPersonnelData() {
  const identities = await db.salesPlatformIdentity.deleteMany();
  const teamHistory = await db.userTeamHistory.deleteMany();
  const users = await db.user.deleteMany({ where: { role: { not: "DIRECTOR" } } });
  const orgUnits = await db.orgUnit.deleteMany({ where: { id: { not: "div-leadspace" } } });
  return { identities, teamHistory, users, orgUnits };
}

async function runReimport() {
  console.log("\n=== 重新导入 ===");
  const antonio = await ensureAntonioDirector();

  await db.systemConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dataMode: "MANUAL_UPLOAD" },
    update: { dataMode: "MANUAL_UPLOAD" },
  });

  if (fs.existsSync(PERSONNEL_FILE)) {
    console.log("人员名单:", PERSONNEL_FILE.split("/").pop());
    const personnel = await importPersonnelFromFile(PERSONNEL_FILE);
    console.log(personnel);
  } else {
    console.warn("跳过人员名单（文件不存在）:", PERSONNEL_FILE);
  }

  let totalImported = 0;
  let totalAnomaly = 0;
  let totalSkipped = 0;

  for (const file of MERCHANT_FILES) {
    if (!fs.existsSync(file)) {
      console.warn("跳过不存在:", file);
      continue;
    }
    console.log("商户明细:", file.split("/").pop());
    const result = await importExcelFromPath(file, antonio.id, true);
    console.log(
      `  成功 ${result.importedRows} / 跳过 ${result.skippedRows} / 异常 ${result.anomalyRows}`
    );
    totalImported += result.importedRows;
    totalAnomaly += result.anomalyRows;
    totalSkipped += result.skippedRows;
  }

  console.log("\n=== 导入汇总 ===");
  console.log(`成功: ${totalImported}`);
  console.log(`重复跳过: ${totalSkipped}`);
  console.log(`未匹配: ${totalAnomaly}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL 未配置");
    process.exit(1);
  }

  if (!confirm) {
    printUsage();
    const before = await countSnapshot();
    console.log("当前数据量（未执行删除）:");
    console.log(`  商户记录: ${before.merchants}`);
    console.log(`  异常归档: ${before.anomalies}`);
    console.log(`  导入日志: ${before.importLogs}`);
    console.log(`  商机: ${before.opportunities}`);
    if (resetPersonnel || args.length === 0) {
      console.log(`  业务员: ${before.sales}，经理: ${before.managers}`);
      console.log(`  PID 身份: ${before.identities}，团队: ${before.teams}`);
    }
    process.exit(0);
  }

  const before = await countSnapshot();
  console.log("=== 重置导入数据 ===");
  console.log("重置前:", before);

  const merchantResult = await resetMerchantData();
  console.log("\n已清空商户导入数据:", merchantResult);

  if (resetPersonnel) {
    const personnelResult = await resetPersonnelData();
    console.log("已清空人员与组织:", personnelResult);
  }

  const after = await countSnapshot();
  console.log("\n重置后:", after);

  if (reimport) {
    await runReimport();
    const final = await countSnapshot();
    console.log("\n导入完成后:", final);
  } else {
    console.log("\n如需重新导入，请运行:");
    console.log("  npm run import:all");
    console.log("或一步完成:");
    console.log("  npm run import:reset -- --confirm --reimport");
    if (!resetPersonnel) {
      console.log("  npm run import:reset -- --confirm --personnel --reimport  # 人员也重建");
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
