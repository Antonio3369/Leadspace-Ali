import * as XLSX from "xlsx";
import type {
  PhotoStatus,
  RiskStatus,
  SalesActivationStatus,
} from "@/generated/prisma/client";
import { computeSalesActivationStatus } from "@/lib/business-rules";

export interface ParsedMerchantRow {
  jobNumber: string;
  merchantPid?: string;
  merchantName: string;
  salesUserName: string;
  salesEmployeePid?: string;
  opportunityName?: string;
  photoStatus: PhotoStatus;
  riskStatus: RiskStatus;
  salesActivationStatus: SalesActivationStatus;
  riskFailReason?: string;
  expandDate: Date;
  touchCount15d: number;
  scanCount15d: number;
  transactionCount30d: number;
  rawRow: Record<string, unknown>;
  rowIndex: number;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  jobNumber: ["作业编号", "作业号"],
  merchantPid: ["商家PID", "商家 PID", "PID"],
  merchantName: ["商家名称", "商户名称"],
  salesUserName: ["员工名称", "业务员", "业务员姓名", "拓展人"],
  salesEmployeePid: ["员工id", "员工ID", "员工 Id"],
  opportunityName: ["商机内容", "商机", "商机类型", "商机名称"],
  photoStatus: ["照片审核结果", "照片状态", "作业图片审核结果"],
  riskStatus: ["风控审核结果", "风控状态", "作业风控审核结果"],
  riskFailReason: ["不通过原因", "驳回原因"],
  expandDate: ["拓展日期", "拓展时间"],
  touchCount15d: [
    "15天内有效碰笔数",
    "15天有效碰笔数",
    "15天碰笔数",
    "15天内有效碰笔数（蓝环）",
  ],
  scanCount15d: [
    "15天内有效扫码笔数",
    "15天内有效扫码数",
    "15天有效扫码数",
    "15天扫码数",
    "15天收钱码大码有效交易笔数",
    "15天内有效扫码笔数（蓝环）",
  ],
  transactionCount30d: [
    "30天内有效交易笔数",
    "30天有效交易笔数",
    "30天内经营码有效交易笔数",
    "30天内收钱码有效交易笔数",
    "30天收钱码大码有效交易笔数",
    "30天内有效交易笔数（码）",
  ],
};

function normalizeHeader(header: string): string {
  return header.trim();
}

function findColumnKey(
  headers: string[],
  field: keyof typeof COLUMN_ALIASES
): string | undefined {
  const aliases = COLUMN_ALIASES[field];
  return headers.find((h) => aliases.some((a) => normalizeHeader(h) === a));
}

function parseStatus<T extends string>(
  value: unknown,
  mapping: Record<string, T>,
  defaultValue: T
): T {
  if (value == null || value === "" || String(value).trim() === "-") {
    return defaultValue;
  }
  const str = String(value).trim();
  return mapping[str] ?? defaultValue;
}

const PHOTO_STATUS_MAP: Record<string, PhotoStatus> = {
  待审核: "PENDING",
  审核中: "PENDING",
  待定: "PENDING",
  "-": "PENDING",
  通过: "APPROVED",
  已通过: "APPROVED",
  不通过: "REJECTED",
  驳回: "REJECTED",
};

const RISK_STATUS_MAP: Record<string, RiskStatus> = {
  待审核: "PENDING",
  审核中: "PENDING",
  待定: "PENDING",
  "-": "PENDING",
  通过: "PASSED",
  已通过: "PASSED",
  不通过: "FAILED",
  驳回: "FAILED",
};

function parseNumber(value: unknown): number {
  if (value == null || value === "" || String(value).trim() === "-") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === "" || String(value).trim() === "-") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getCell(row: Record<string, unknown>, colKey?: string): unknown {
  if (!colKey) return undefined;
  return row[colKey];
}

/** 从多个候选列中取数值最大值 */
function parseMaxFromAliases(row: Record<string, unknown>, headers: string[], aliases: string[]): number {
  let max = 0;
  for (const h of headers) {
    if (aliases.some((a) => normalizeHeader(h) === a)) {
      max = Math.max(max, parseNumber(row[h]));
    }
  }
  return max;
}

function parseSheetRows(
  jsonRows: Record<string, unknown>[],
  sheetName: string
): {
  rows: ParsedMerchantRow[];
  errors: { rowIndex: number; reason: string; raw: Record<string, unknown> }[];
} {
  if (jsonRows.length === 0) {
    return { rows: [], errors: [] };
  }

  const headers = Object.keys(jsonRows[0] ?? {});
  const colMap = Object.fromEntries(
    (Object.keys(COLUMN_ALIASES) as (keyof typeof COLUMN_ALIASES)[]).map((field) => [
      field,
      findColumnKey(headers, field),
    ])
  ) as Record<keyof typeof COLUMN_ALIASES, string | undefined>;

  const rows: ParsedMerchantRow[] = [];
  const errors: { rowIndex: number; reason: string; raw: Record<string, unknown> }[] = [];

  jsonRows.forEach((rawRow, index) => {
    const rowIndex = index + 2;

    const jobNumber = String(getCell(rawRow, colMap.jobNumber) ?? "").trim();
    const merchantName = String(getCell(rawRow, colMap.merchantName) ?? "").trim();
    const salesUserName = String(getCell(rawRow, colMap.salesUserName) ?? "").trim();
    const salesEmployeePid =
      String(getCell(rawRow, colMap.salesEmployeePid) ?? "").trim() || undefined;

    if (!jobNumber && !merchantName && !salesUserName) return;

    if (!jobNumber) {
      errors.push({
        rowIndex,
        reason: `[${sheetName}] 缺少作业编号`,
        raw: { ...rawRow, _sheet: sheetName },
      });
      return;
    }

    if (!salesUserName) {
      errors.push({
        rowIndex,
        reason: `[${sheetName}] 缺少员工名称`,
        raw: { ...rawRow, _sheet: sheetName },
      });
      return;
    }

    const expandDate = parseDate(getCell(rawRow, colMap.expandDate));
    if (!expandDate) {
      errors.push({
        rowIndex,
        reason: `[${sheetName}] 拓展日期无效或缺失`,
        raw: { ...rawRow, _sheet: sheetName },
      });
      return;
    }

    const photoStatus = parseStatus(
      getCell(rawRow, colMap.photoStatus),
      PHOTO_STATUS_MAP,
      "PENDING"
    );
    const riskStatus = parseStatus(
      getCell(rawRow, colMap.riskStatus),
      RISK_STATUS_MAP,
      "PENDING"
    );
    const touchCount15d = parseMaxFromAliases(rawRow, headers, COLUMN_ALIASES.touchCount15d);
    const scanCount15d = parseMaxFromAliases(rawRow, headers, COLUMN_ALIASES.scanCount15d);
    const transactionCount30d = parseMaxFromAliases(
      rawRow,
      headers,
      COLUMN_ALIASES.transactionCount30d
    );

    const salesActivationStatus = computeSalesActivationStatus({
      photoStatus,
      touchCount15d,
      scanCount15d,
      transactionCount30d,
      salesActivationStatus: "NOT_ACTIVATED",
    });

    const opportunityFromCell =
      String(getCell(rawRow, colMap.opportunityName) ?? "").trim() || undefined;

    rows.push({
      jobNumber,
      merchantPid: String(getCell(rawRow, colMap.merchantPid) ?? "").trim() || undefined,
      merchantName: merchantName || jobNumber,
      salesUserName,
      salesEmployeePid,
      opportunityName: opportunityFromCell ?? sheetName,
      photoStatus,
      riskStatus,
      salesActivationStatus,
      riskFailReason: String(getCell(rawRow, colMap.riskFailReason) ?? "").trim() || undefined,
      expandDate,
      touchCount15d,
      scanCount15d,
      transactionCount30d,
      rawRow: { ...rawRow, _sheet: sheetName },
      rowIndex,
    });
  });

  return { rows, errors };
}

export function parseExcelBuffer(buffer: Buffer): {
  rows: ParsedMerchantRow[];
  errors: { rowIndex: number; reason: string; raw: Record<string, unknown> }[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (workbook.SheetNames.length === 0) {
    return { rows: [], errors: [{ rowIndex: 0, reason: "Excel 文件无工作表", raw: {} }] };
  }

  const allRows: ParsedMerchantRow[] = [];
  const allErrors: { rowIndex: number; reason: string; raw: Record<string, unknown> }[] = [];
  const seenJobNumbers = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName]!,
      { defval: "", raw: false }
    );
    const { rows, errors } = parseSheetRows(jsonRows, sheetName);
    allErrors.push(...errors);
    for (const row of rows) {
      if (seenJobNumbers.has(row.jobNumber)) continue;
      seenJobNumbers.add(row.jobNumber);
      allRows.push(row);
    }
  }

  return { rows: allRows, errors: allErrors };
}
