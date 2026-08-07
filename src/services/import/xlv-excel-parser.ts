import * as XLSX from "xlsx";
import { parseXlvStatDateFromCell } from "@/lib/xlv-stat-date";
import {
  buildXlvAssignmentColumnMeta,
  buildXlvRawColumnMeta,
  buildXlvRosterColumnMeta,
  type XlvImportFormat,
} from "@/services/import/xlv-import-summary";

export type { XlvImportFormat };

export interface ParsedXlvRawRow {
  format: "raw";
  deviceSn: string;
  statDate: Date;
  cumulativeUsers: number;
  cumulativeTxns: number;
  cumulativeAmount: number;
  agentId: string | null;
  agentName: string | null;
  activationMerchantName: string | null;
  isActivated: boolean;
  firstTxnDate: Date | null;
  lastTxnDate: Date | null;
  sleepDays: number;
  dailyUsers: number;
  dailyTxns: number;
  dailyAmount: number;
  rowIndex: number;
}

export interface ParsedXlvRosterRow {
  format: "roster";
  operatorName: string;
  managerName: string;
  companyName: string | null;
  rowIndex: number;
}

export interface ParsedXlvAssignmentRow {
  format: "assignment";
  deviceSn: string;
  statDate: Date | null;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  merchantName: string | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  cumulativeAmount: number;
  lastTxnDate: Date | null;
  sleepDays: number;
  isActivated: boolean;
  firstTxnDate: Date | null;
  rowIndex: number;
}

/** @deprecated 使用 ParsedXlvAssignmentRow */
export type ParsedXlvPersonnelRow = ParsedXlvAssignmentRow;

export type ParsedXlvRow =
  | ParsedXlvRawRow
  | ParsedXlvRosterRow
  | ParsedXlvAssignmentRow;

export type XlvParseColumnMeta = {
  columns: import("@/services/import/xlv-import-summary").XlvImportColumnStatus[];
};

export interface ParseXlvResult {
  format: XlvImportFormat;
  sheetName: string;
  rows: ParsedXlvRow[];
  errors: string[];
  meta?: XlvParseColumnMeta;
}

function normalizeHeader(header: string): string {
  return String(header).replace(/\r/g, "").trim();
}

function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/^\t+|\t+$/g, "").trim();
}

function parseYmd(value: unknown): Date | null {
  return parseXlvStatDateFromCell(value);
}

function parseNum(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseBool(value: unknown): boolean {
  const s = cellStr(value);
  return s === "1" || s.toLowerCase() === "true" || s === "是";
}

const XLV_OPERATOR_HEADERS = [
  "所属作业员",
  "作业员（姓名）",
  "作业员姓名",
  "作业员",
  "作业人员",
] as const;

const XLV_MANAGER_HEADERS = [
  "所属经理（姓名）",
  "所属经理",
  "经理姓名",
  "经理",
] as const;

const XLV_COMPANY_HEADERS = ["所属公司", "公司名称", "公司"] as const;

function headerIndex(headers: string[], names: readonly string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const idx = normalized.indexOf(normalizeHeader(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

function hasHeader(headers: string[], names: readonly string[]): boolean {
  return headerIndex(headers, names) >= 0;
}

function detectFormat(headers: string[]): XlvImportFormat {
  const normalized = headers.map(normalizeHeader);
  const hasSn = normalized.includes("设备SN") || normalized.includes("SN");
  const hasOperator = hasHeader(headers, XLV_OPERATOR_HEADERS);
  const hasManager = hasHeader(headers, XLV_MANAGER_HEADERS);

  if (!hasSn && hasOperator && hasManager) return "roster";
  if (hasSn && hasOperator) return "assignment";
  return "raw";
}

export function parseXlvExcelBuffer(buffer: Buffer): ParseXlvResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { format: "raw", sheetName: "", rows: [], errors: ["Excel 无工作表"] };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  if (matrix.length < 2) {
    return {
      format: "raw",
      sheetName,
      rows: [],
      errors: ["表格无数据行"],
    };
  }

  const headers = (matrix[0] as unknown[]).map((h) => cellStr(h));
  const format = detectFormat(headers);
  const errors: string[] = [];
  const rows: ParsedXlvRow[] = [];

  if (format === "roster") {
    const idxOp = headerIndex(headers, XLV_OPERATOR_HEADERS);
    const idxMgr = headerIndex(headers, XLV_MANAGER_HEADERS);
    const idxCompany = headerIndex(headers, XLV_COMPANY_HEADERS);
    const meta: XlvParseColumnMeta = {
      columns: buildXlvRosterColumnMeta(headers, {
        operator: idxOp,
        manager: idxMgr,
        company: idxCompany,
      }),
    };

    if (idxOp < 0 || idxMgr < 0) {
      return {
        format,
        sheetName,
        rows: [],
        errors: ["组织名册缺少列：所属作业员 / 所属经理"],
        meta,
      };
    }

    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i] as unknown[];
      const operatorName = cellStr(row[idxOp]);
      const managerName = cellStr(row[idxMgr]);
      if (!operatorName || !managerName) continue;
      rows.push({
        format: "roster",
        operatorName,
        managerName,
        companyName: idxCompany >= 0 ? cellStr(row[idxCompany]) || null : null,
        rowIndex: i + 1,
      });
    }

    if (rows.length === 0) errors.push("未解析到有效名册行");
    return { format, sheetName, rows, errors, meta };
  }

  const idxSn = headerIndex(headers, ["设备SN", "SN"]);
  const idxStat = headerIndex(headers, ["统计日期"]);
  const idxUsers = headerIndex(headers, [
    "累计交易用户数(单设备)",
    "累计交易用户数(单设备名)",
  ]);
  const idxTxns = headerIndex(headers, [
    "累计有效交易笔数(交易金额>=1元)",
    "累计有效交易笔数(交易金额>=1元）",
    "累计有效交易笔数(金额>=1元)",
    "累计有效交易笔数(金额>=1元）",
  ]);
  const idxAmount = headerIndex(headers, ["累计有效交易金额(高于200按200计)"]);

  if (idxSn < 0) {
    return { format, sheetName, rows: [], errors: ["缺少列：设备SN"] };
  }

  let meta: XlvParseColumnMeta | undefined;

  if (format === "assignment") {
    const idxOp = headerIndex(headers, XLV_OPERATOR_HEADERS);
    const idxMgr = headerIndex(headers, XLV_MANAGER_HEADERS);
    const idxCompany = headerIndex(headers, XLV_COMPANY_HEADERS);
    const idxMerchant = headerIndex(headers, ["商户名称"]);
    const idxLast = headerIndex(headers, ["最后一笔交易日期"]);
    const idxSleep = headerIndex(headers, ["沉睡天数"]);
    const idxActivated = headerIndex(headers, ["是否激活"]);
    const idxFirst = headerIndex(headers, ["首笔交易日期"]);

    meta = {
      columns: buildXlvAssignmentColumnMeta(headers, {
        sn: idxSn,
        stat: idxStat,
        operator: idxOp,
        manager: idxMgr,
        merchant: idxMerchant,
        users: idxUsers,
        txns: idxTxns,
      }),
    };

    if (idxOp < 0) {
      return {
        format,
        sheetName,
        rows: [],
        errors: ["SN 归属表缺少列：所属作业员"],
        meta,
      };
    }

    if (idxMgr < 0) {
      errors.push("未含「所属经理」列，将尝试从已导入的组织名册反查经理");
    }

    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i] as unknown[];
      const deviceSn = cellStr(row[idxSn]);
      if (!deviceSn) continue;
      rows.push({
        format: "assignment",
        deviceSn,
        statDate: idxStat >= 0 ? parseYmd(row[idxStat]) : null,
        operatorName: cellStr(row[idxOp]),
        managerName: idxMgr >= 0 ? cellStr(row[idxMgr]) : "",
        companyName: idxCompany >= 0 ? cellStr(row[idxCompany]) || null : null,
        merchantName: idxMerchant >= 0 ? cellStr(row[idxMerchant]) || null : null,
        cumulativeUsers: idxUsers >= 0 ? parseNum(row[idxUsers]) : 0,
        cumulativeTxns: idxTxns >= 0 ? parseNum(row[idxTxns]) : 0,
        cumulativeAmount: idxAmount >= 0 ? parseNum(row[idxAmount]) : 0,
        lastTxnDate: idxLast >= 0 ? parseYmd(row[idxLast]) : null,
        sleepDays: idxSleep >= 0 ? parseNum(row[idxSleep]) : 0,
        isActivated: idxActivated >= 0 ? parseBool(row[idxActivated]) : true,
        firstTxnDate: idxFirst >= 0 ? parseYmd(row[idxFirst]) : null,
        rowIndex: i + 1,
      });
    }
  } else {
    const idxAgentId = headerIndex(headers, ["代理商id", "代理商ID"]);
    const idxAgentName = headerIndex(headers, ["代理商名称"]);
    const idxActivationMerchant = headerIndex(headers, [
      "激活子商户名称（首笔交易）",
    ]);
    const idxLast = headerIndex(headers, ["最后一笔交易日期"]);
    const idxSleep = headerIndex(headers, ["沉睡天数"]);
    const idxActivated = headerIndex(headers, ["是否激活"]);
    const idxFirst = headerIndex(headers, ["首笔交易日期"]);
    const idxDailyUsers = headerIndex(headers, [
      "当日交易用户数(单设备)",
      "当日交易用户数(单设备名)",
    ]);
    const idxDailyTxns = headerIndex(headers, [
      "当日有效交易笔数(交易金额>=1元)",
      "当日有效交易笔数(交易金额>=1元）",
      "当日有效交易笔数(金额>=1元)",
      "当日有效交易笔数(金额>=1元）",
    ]);
    const idxDailyTxnsFallback = headerIndex(headers, [
      "当日交易笔数(单设备名)",
      "当日交易笔数(单设备)",
    ]);
    const idxDailyAmount = headerIndex(headers, [
      "当日有效交易金额(高于200按200计)",
      "当日交易金额(单设备实付金额)",
    ]);

    meta = {
      columns: buildXlvRawColumnMeta(headers, {
        sn: idxSn,
        stat: idxStat,
        users: idxUsers,
        txns: idxTxns,
        amount: idxAmount,
        dailyUsers: idxDailyUsers,
        dailyTxns: idxDailyTxns >= 0 ? idxDailyTxns : idxDailyTxnsFallback,
        dailyAmount: idxDailyAmount,
      }),
    };

    if (idxStat < 0) {
      return {
        format,
        sheetName,
        rows: [],
        errors: ["原始表缺少列：统计日期"],
        meta,
      };
    }

    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i] as unknown[];
      const deviceSn = cellStr(row[idxSn]);
      const statDate = parseYmd(row[idxStat]);
      if (!deviceSn || !statDate) continue;

      let dailyUsers = idxDailyUsers >= 0 ? parseNum(row[idxDailyUsers]) : 0;
      let dailyTxns = idxDailyTxns >= 0 ? parseNum(row[idxDailyTxns]) : 0;
      if (dailyTxns === 0 && idxDailyTxnsFallback >= 0) {
        dailyTxns = parseNum(row[idxDailyTxnsFallback]);
      }
      const dailyAmount = idxDailyAmount >= 0 ? parseNum(row[idxDailyAmount]) : 0;

      rows.push({
        format: "raw",
        deviceSn,
        statDate,
        cumulativeUsers: idxUsers >= 0 ? parseNum(row[idxUsers]) : 0,
        cumulativeTxns: idxTxns >= 0 ? parseNum(row[idxTxns]) : 0,
        cumulativeAmount: idxAmount >= 0 ? parseNum(row[idxAmount]) : 0,
        agentId: idxAgentId >= 0 ? cellStr(row[idxAgentId]) || null : null,
        agentName: idxAgentName >= 0 ? cellStr(row[idxAgentName]) || null : null,
        activationMerchantName:
          idxActivationMerchant >= 0
            ? cellStr(row[idxActivationMerchant]) || null
            : null,
        isActivated: idxActivated >= 0 ? parseBool(row[idxActivated]) : true,
        firstTxnDate: idxFirst >= 0 ? parseYmd(row[idxFirst]) : null,
        lastTxnDate: idxLast >= 0 ? parseYmd(row[idxLast]) : null,
        sleepDays: idxSleep >= 0 ? parseNum(row[idxSleep]) : 0,
        dailyUsers,
        dailyTxns,
        dailyAmount,
        rowIndex: i + 1,
      });
    }

    if (rows.length > 0) {
      if (idxTxns < 0) {
        errors.push(
          "未识别「累计有效交易笔数」列，笔数类指标将为 0；图表将尝试用累计差分推算"
        );
      }
      if (idxUsers < 0) {
        errors.push("未识别「累计交易用户数」列，用户类指标将为 0");
      }
      if (idxDailyUsers < 0) {
        errors.push(
          "未识别「当日交易用户数」列（常见表头含「单设备名」），将依赖累计差分"
        );
      }
      if (idxDailyTxns < 0 && idxDailyTxnsFallback < 0) {
        errors.push("未识别「当日有效交易笔数」列，将依赖累计差分");
      }
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push("未解析到有效数据行");
  }

  return { format, sheetName, rows, errors, meta };
}
