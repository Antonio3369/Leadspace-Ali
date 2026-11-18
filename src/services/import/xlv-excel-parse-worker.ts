/**
 * Short-lived child: reads JSON { bufferBase64, fileName } from stdin,
 * runs parseXlvExcelBuffer, writes compact JSON to stdout, then exits.
 */
import { parseXlvExcelBuffer } from "@/services/import/xlv-excel-parser";
import {
  encodeParseXlvResult,
  type XlvParseWorkerRequest,
} from "@/services/import/xlv-parse-result-codec";

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function main() {
  const raw = (await readStdin()).toString("utf8");
  const req = JSON.parse(raw) as XlvParseWorkerRequest;
  const buffer = Buffer.from(req.bufferBase64, "base64");
  const result = parseXlvExcelBuffer(buffer, req.fileName);
  process.stdout.write(encodeParseXlvResult(result));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(msg);
  process.exit(1);
});