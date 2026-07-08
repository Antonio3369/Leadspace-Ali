import fs from "fs";
import * as XLSX from "xlsx";
import { parseExcelBuffer } from "../src/services/import/excel-parser";
import {
  buildPersonnelLookupFromRows,
  findUserInIndexes,
} from "../src/services/org/lookup-indexes";

const PERSONNEL_FILE =
  process.env.PERSONNEL_FILE ??
  "/Users/xin/Desktop/支付宝 agent/支付宝作业人员名单(1)(1).xlsx";

const MERCHANT_FILES = (
  process.env.MERCHANT_FILES?.split(",").map((s) => s.trim()) ?? [
    "/Users/xin/Desktop/支付宝 agent/6.1-6.20/推广商家明细-5.xlsx",
    "/Users/xin/Desktop/支付宝 agent/6.1-6.20/推广商家明细-6.xlsx",
    "/Users/xin/Desktop/支付宝 agent/6.1-6.20/推广商家明细-7.xlsx",
  ]
).filter(Boolean);

function loadPersonnelRows(filePath: string): Record<string, string>[] {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  return XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]!], {
    defval: "",
  });
}

function analyzeFile(
  filePath: string,
  indexes: ReturnType<typeof buildPersonnelLookupFromRows>
) {
  if (!fs.existsSync(filePath)) {
    console.warn("  文件不存在，跳过:", filePath);
    return null;
  }

  const buffer = fs.readFileSync(filePath);
  const { rows, errors } = parseExcelBuffer(buffer);
  const name = filePath.split("/").pop() ?? filePath;

  let matchedByPid = 0;
  let matchedByNameOnly = 0;
  let matchedNameOnlyBaseline = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];

  for (const row of rows) {
    const byPid = row.salesEmployeePid
      ? findUserInIndexes(indexes, row.salesUserName, row.salesEmployeePid)
      : null;
    const byName = findUserInIndexes(indexes, row.salesUserName);

    if (byPid) {
      matchedByPid++;
    } else if (byName) {
      matchedByNameOnly++;
    } else {
      unmatched++;
      if (unmatchedSamples.length < 5) {
        unmatchedSamples.push(
          `${row.salesUserName}${row.salesEmployeePid ? ` (id:${row.salesEmployeePid})` : ""}`
        );
      }
    }
    if (byName) matchedNameOnlyBaseline++;
  }

  const total = rows.length;
  const matchedTotal = matchedByPid + matchedByNameOnly;
  const rate = total > 0 ? ((matchedTotal / total) * 100).toFixed(1) : "0";
  const nameOnlyRate =
    total > 0 ? ((matchedNameOnlyBaseline / total) * 100).toFixed(1) : "0";

  console.log(`\n--- ${name} ---`);
  console.log(`  解析行数: ${total}（解析错误 ${errors.length}）`);
  console.log(`  PID 优先匹配: ${matchedByPid}`);
  console.log(`  姓名兜底匹配: ${matchedByNameOnly}`);
  console.log(`  未匹配: ${unmatched}`);
  console.log(`  新逻辑总匹配率: ${rate}%`);
  console.log(`  旧逻辑（仅姓名）: ${nameOnlyRate}%`);
  if (unmatchedSamples.length > 0) {
    console.log(`  未匹配样例: ${unmatchedSamples.join("；")}`);
  }

  return { total, matchedByPid, matchedByNameOnly, unmatched, parseErrors: errors.length };
}

function main() {
  if (!fs.existsSync(PERSONNEL_FILE)) {
    console.error("人员名单不存在:", PERSONNEL_FILE);
    process.exit(1);
  }

  const personnelRows = loadPersonnelRows(PERSONNEL_FILE);
  const indexes = buildPersonnelLookupFromRows(personnelRows);
  const pidCount = indexes.byPersonalPid.size;
  const nameCount = indexes.byName.size;

  console.log("=== 匹配分析（内存模拟，不写库）===");
  console.log(`人员名单: ${PERSONNEL_FILE}`);
  console.log(`  行数 ${personnelRows.length}，PID 索引 ${pidCount}，姓名索引 ${nameCount}`);

  let grandTotal = 0;
  let grandMatched = 0;
  let grandUnmatched = 0;

  for (const file of MERCHANT_FILES) {
    const result = analyzeFile(file, indexes);
    if (result) {
      grandTotal += result.total;
      grandMatched += result.matchedByPid + result.matchedByNameOnly;
      grandUnmatched += result.unmatched;
    }
  }

  if (MERCHANT_FILES.length > 1) {
    const rate = grandTotal > 0 ? ((grandMatched / grandTotal) * 100).toFixed(1) : "0";
    console.log("\n=== 汇总 ===");
    console.log(`  总行数: ${grandTotal}`);
    console.log(`  可匹配: ${grandMatched}`);
    console.log(`  未匹配: ${grandUnmatched}`);
    console.log(`  总匹配率: ${rate}%`);
  }
}

main();
