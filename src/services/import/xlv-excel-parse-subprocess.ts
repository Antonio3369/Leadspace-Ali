import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { ParseXlvResult } from "@/services/import/xlv-excel-parser";
import {
  decodeParseXlvResult,
  encodeParseWorkerRequest,
} from "@/services/import/xlv-parse-result-codec";

const WORKER_BASENAME = "xlv-parse-worker.mjs";
const WORKER_TS = path.join(
  process.cwd(),
  "src/services/import/xlv-excel-parse-worker.ts"
);

export function resolveXlvParseWorkerScript(): string {
  if (process.env.XLV_PARSE_WORKER_PATH) {
    return process.env.XLV_PARSE_WORKER_PATH;
  }
  const bundled = path.join(process.cwd(), "scripts", WORKER_BASENAME);
  if (fs.existsSync(bundled)) return bundled;
  const alt = path.join(process.cwd(), ".next", "standalone", "scripts", WORKER_BASENAME);
  if (fs.existsSync(alt)) return alt;
  return bundled;
}

function devWorkerCommand(): { command: string; args: string[] } | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!fs.existsSync(WORKER_TS)) return null;
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  if (fs.existsSync(tsxCli)) {
    return { command: process.execPath, args: [tsxCli, WORKER_TS] };
  }
  return { command: "npx", args: ["tsx", WORKER_TS] };
}

export async function parseXlvExcelBufferInChild(
  buffer: Buffer,
  fileName?: string
): Promise<ParseXlvResult> {
  const workerScript = resolveXlvParseWorkerScript();
  const useBundled = fs.existsSync(workerScript);
  const devCmd = !useBundled ? devWorkerCommand() : null;

  if (!useBundled && !devCmd) {
    throw new Error(
      `XLV parse worker not found at ${workerScript}; run npm run build:parse-worker`
    );
  }

  const command = useBundled ? process.execPath : devCmd!.command;
  const args = useBundled ? [workerScript] : devCmd!.args;

  const payload = encodeParseWorkerRequest(buffer, fileName);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "" },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

    child.on("error", reject);
    child.stdin.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code !== "EPIPE") reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const errText = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(
          new Error(
            errText || `XLV parse worker exited with code ${code ?? "unknown"}`
          )
        );
        return;
      }
      try {
        const json = Buffer.concat(stdoutChunks).toString("utf8");
        resolve(decodeParseXlvResult(json));
      } catch (err) {
        reject(err);
      }
    });

    child.stdin.write(payload, "utf8", () => {
      child.stdin.end();
    });
  });
}