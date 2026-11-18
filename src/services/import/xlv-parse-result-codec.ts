import type {
  ParseXlvResult,
  ParsedXlvAssignmentRow,
  ParsedXlvRawRow,
  ParsedXlvRosterRow,
  ParsedXlvRow,
} from "@/services/import/xlv-excel-parser";

type SerDate = string | null;

function serDate(d: Date | null | undefined): SerDate {
  if (d == null) return null;
  return d.toISOString();
}

function deDate(s: SerDate): Date | null {
  if (s == null || s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function serializeRow(row: ParsedXlvRow): Record<string, unknown> {
  if (row.format === "roster") {
    return { ...row };
  }
  if (row.format === "assignment") {
    const r = row as ParsedXlvAssignmentRow;
    return {
      ...r,
      statDate: serDate(r.statDate),
      lastTxnDate: serDate(r.lastTxnDate),
      firstTxnDate: serDate(r.firstTxnDate),
    };
  }
  const r = row as ParsedXlvRawRow;
  return {
    ...r,
    statDate: serDate(r.statDate),
    lastTxnDate: serDate(r.lastTxnDate),
    firstTxnDate: serDate(r.firstTxnDate),
  };
}

function deserializeRow(raw: Record<string, unknown>): ParsedXlvRow {
  const format = raw.format;
  if (format === "roster") {
    return raw as unknown as ParsedXlvRosterRow;
  }
  if (format === "assignment") {
    return {
      ...(raw as unknown as ParsedXlvAssignmentRow),
      statDate: deDate(raw.statDate as SerDate),
      lastTxnDate: deDate(raw.lastTxnDate as SerDate),
      firstTxnDate: deDate(raw.firstTxnDate as SerDate),
    };
  }
  return {
    ...(raw as unknown as ParsedXlvRawRow),
    statDate: deDate(raw.statDate as SerDate)!,
    lastTxnDate: deDate(raw.lastTxnDate as SerDate),
    firstTxnDate: deDate(raw.firstTxnDate as SerDate),
  };
}

export function encodeParseXlvResult(result: ParseXlvResult): string {
  return JSON.stringify({
    format: result.format,
    sheetName: result.sheetName,
    errors: result.errors,
    meta: result.meta,
    rows: result.rows.map(serializeRow),
  });
}

export function decodeParseXlvResult(json: string): ParseXlvResult {
  const parsed = JSON.parse(json) as {
    format: ParseXlvResult["format"];
    sheetName: string;
    errors: string[];
    meta?: ParseXlvResult["meta"];
    rows: Record<string, unknown>[];
  };
  return {
    format: parsed.format,
    sheetName: parsed.sheetName,
    errors: parsed.errors,
    meta: parsed.meta,
    rows: parsed.rows.map(deserializeRow),
  };
}

export type XlvParseWorkerRequest = {
  bufferBase64: string;
  fileName?: string;
};

export function encodeParseWorkerRequest(
  buffer: Buffer,
  fileName?: string
): string {
  const body: XlvParseWorkerRequest = {
    bufferBase64: buffer.toString("base64"),
    fileName,
  };
  return JSON.stringify(body);
}