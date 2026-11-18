import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { describe, it } from "node:test";
import { xlvStatDateKey } from "@/lib/xlv-stat-date";
import { parseXlvExcelBuffer } from "@/services/import/xlv-excel-parser";
import { parseXlvExcelBufferInChild } from "@/services/import/xlv-excel-parse-subprocess";

const fixturePath =
  "/home/ubuntu/.cursor/projects/agent-repos-Leadspace-Ali/uploads/file-a-770k_908f.xlsx";

describe("xlv excel child parse", () => {
  it("parses 付呗 fixture with 5110 rows dated 2026-11-17", async () => {
    if (!fs.existsSync(fixturePath)) {
      return;
    }
    const buffer = fs.readFileSync(fixturePath);
    const fileName = "付呗11.17微信盒子数据.xlsx";
    const inProcess = parseXlvExcelBuffer(buffer, fileName);
    const fromChild = await parseXlvExcelBufferInChild(buffer, fileName);

    assert.equal(fromChild.rows.length, 5110);
    assert.equal(inProcess.rows.length, fromChild.rows.length);
    assert.equal(fromChild.format, "raw");

    for (const row of fromChild.rows) {
      if (row.format !== "raw") continue;
      assert.equal(xlvStatDateKey(row.statDate), "2026-11-17");
    }
  });
});