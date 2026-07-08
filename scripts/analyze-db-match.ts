import "dotenv/config";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseExcelBuffer } from "../src/services/import/excel-parser";
import { buildUserLookupIndexes, findUserInIndexes } from "../src/services/org/user-matcher";

const PERSONNEL_FILE =
  process.env.PERSONNEL_FILE ??
  "/Users/xin/Desktop/支付宝 agent/支付宝作业人员名单(1)(1).xlsx";

const MERCHANT_FILES = [
  "/Users/xin/Desktop/支付宝 agent/6.1-6.20/推广商家明细-5.xlsx",
  "/Users/xin/Desktop/支付宝 agent/6.1-6.20/推广商家明细-6.xlsx",
  "/Users/xin/Desktop/支付宝 agent/6.1-6.20/推广商家明细-7.xlsx",
];

async function main() {
  const indexes = await buildUserLookupIndexes();
  console.log("=== DB 索引匹配分析 ===");
  console.log(`PID 索引: ${indexes.byPersonalPid.size}，姓名索引: ${indexes.byName.size}`);

  let total = 0;
  let matched = 0;
  let pidOnly = 0;

  for (const file of MERCHANT_FILES) {
    if (!fs.existsSync(file)) continue;
    const { rows } = parseExcelBuffer(fs.readFileSync(file));
    const name = file.split("/").pop()!;
    let fileMatched = 0;
    let filePidOnly = 0;

    for (const row of rows) {
      total++;
      const hit = findUserInIndexes(indexes, row.salesUserName, row.salesEmployeePid);
      const nameHit = findUserInIndexes(indexes, row.salesUserName);
      if (hit) {
        matched++;
        fileMatched++;
        if (!nameHit && row.salesEmployeePid) filePidOnly++;
      }
    }

    console.log(
      `${name}: ${fileMatched}/${rows.length} (${((fileMatched / rows.length) * 100).toFixed(1)}%)，PID 独匹配 ${filePidOnly}`
    );
    pidOnly += filePidOnly;
  }

  console.log(
    `\n汇总: ${matched}/${total} (${total ? ((matched / total) * 100).toFixed(1) : 0}%)，PID 独匹配 ${pidOnly}`
  );

  const wb = XLSX.read(fs.readFileSync(PERSONNEL_FILE), { type: "buffer" });
  const personnelRows = XLSX.utils.sheet_to_json<Record<string, string>>(
    wb.Sheets[wb.SheetNames[0]!],
    { defval: "" }
  );
  console.log(`\n人员名单行数: ${personnelRows.length}，DB 身份数: ${indexes.byPersonalPid.size}`);
}

main().catch(console.error);
