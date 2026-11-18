import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { encodeParseWorkerRequest } from "@/services/import/xlv-parse-result-codec";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const workerSrc = path.join(repoRoot, "scripts", "xlv-parse-worker.mjs");

function buildMinimalXlvWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["设备SN", "统计日期", "累计用户数", "累计笔数", "累计金额"],
    ["SN-ISO-001", "2026-11-17", 10, 5, 100.5],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function runWorkerIsolated(workerPath: string, payload: string): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      cwd: path.dirname(workerPath),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_OPTIONS: "",
      },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    child.on("error", reject);
    child.stdin.write(payload, "utf8", () => child.stdin.end());

    child.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

describe("xlv parse worker isolation (no node_modules/xlsx)", () => {
  it("parses rows when only the bundled worker file is present", async () => {
    if (!fs.existsSync(workerSrc)) {
      assert.fail(`missing worker; run npm run build:parse-worker (${workerSrc})`);
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xlv-worker-iso-"));
    const isolatedWorker = path.join(tmp, "xlv-parse-worker.mjs");
    fs.copyFileSync(workerSrc, isolatedWorker);

    const bareImport = fs
      .readFileSync(isolatedWorker, "utf8")
      .match(/from\s+["']xlsx["']/);
    assert.equal(
      bareImport,
      null,
      "worker must not contain external from \"xlsx\" import"
    );

    const buffer = buildMinimalXlvWorkbook();
    const payload = encodeParseWorkerRequest(buffer, "isolation-test.xlsx");
    const { code, stdout, stderr } = await runWorkerIsolated(isolatedWorker, payload);

    const combinedErr = `${stderr}\n${stdout}`;
    assert.ok(
      !/ERR_MODULE_NOT_FOUND|Cannot find package 'xlsx'/.test(combinedErr),
      `unexpected module resolution error: ${combinedErr}`
    );
    assert.equal(code, 0, stderr || "worker exited non-zero");

    const result = JSON.parse(stdout) as { format: string; rows: unknown[] };
    assert.equal(result.format, "raw");
    assert.ok(result.rows.length >= 1, "expected at least one parsed data row");
  });
});