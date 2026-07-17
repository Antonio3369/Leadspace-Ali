import * as XLSX from "xlsx";

export interface ParsedN7DeviceRow {
  deviceSn: string;
  registeredAt: Date | null;
  litAt: Date | null;
  subscribedAt: Date | null;
  firstCheckInAt: Date | null;
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
  assessmentStartAt: Date | null;
  assessmentEndAt: Date | null;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
  effectiveUsers: number;
  isQualified: boolean;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  phase2Days: number;
  phase2Users: number;
  storeId: string | null;
  storeName: string | null;
  storeAddress: string | null;
  storePhone: string | null;
  merchantId: string | null;
  merchantAccount: string | null;
  merchantPhone: string | null;
  rowIndex: number;
}

/** 仅兼容运营加工表（如「7.15」），不接收「原始表格」裸表 */
const COLUMN_ALIASES: Record<string, string[]> = {
  deviceSn: ["设备SN", "设备 Sn", "SN", "机具SN"],
  registeredAt: ["注册时间"],
  litAt: ["点亮时间"],
  subscribedAt: ["订阅时间"],
  firstCheckInAt: ["门店首次打卡时间", "首次打卡时间", "打卡时间"],
  assessmentStartAt: ["考核开始时间"],
  assessmentEndAt: ["考核结束时间"],
  remainingDays: ["剩余考核天数", "剩余考核 天数", "剩余考核\n天数"],
  effectiveDays: [
    "有效作业1-10天内有动销≥2元交易的天数",
    "有效作业1-10天内有动销>=2元交易的天数",
  ],
  effectiveUsers: [
    "有效作业1-10天内有动销≥2元交易的用户数",
    "有效作业1-10天内有动销>=2元交易的用户数",
  ],
  isQualified: ["是否达标"],
  operatorName: ["作业人员", "业务员", "所属业务员"],
  managerName: ["所属经理"],
  companyName: ["所属公司"],
  phase2Days: [
    "有效作业次日起31-60天内/有动销>=2元交易的天数",
    "有效作业次日起31-60天内/有动销≥2元交易的天数",
  ],
  phase2Users: [
    "有效作业次日起31-60天内/有动销>=2元交易的用户数",
    "有效作业次日起31-60天内/有动销≥2元交易的用户数",
  ],
  storeId: ["门店ID", "门店Id"],
  storeName: ["门店名称"],
  storeAddress: ["门店地址"],
  storePhone: ["门店电话"],
  merchantId: ["商户ID", "商户Id"],
  merchantAccount: ["商户账号"],
  merchantPhone: ["商户手机号"],
};

function normalizeHeader(header: string): string {
  return String(header).replace(/\r/g, "").trim();
}

function findColumnKey(
  headers: string[],
  field: keyof typeof COLUMN_ALIASES
): string | undefined {
  const aliases = COLUMN_ALIASES[field];
  return headers.find((h) =>
    aliases.some((a) => normalizeHeader(h) === normalizeHeader(a))
  );
}

function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/^\t+|\t+$/g, "").trim();
}

function isBlankMarker(value: unknown): boolean {
  const s = cellStr(value);
  return !s || s === "-" || s === "--" || s === "—";
}

function parseChineseDate(s: string): Date | null {
  const m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function parseExcelDate(value: unknown): Date | null {
  if (value == null || value === "" || isBlankMarker(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      Math.floor(parsed.S || 0)
    );
  }
  const s = cellStr(value);
  if (!s || s.startsWith("未")) return null;
  const chinese = parseChineseDate(s);
  if (chinese) return chinese;
  const d = new Date(s.replace(/-/g, "/"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSpecialTimestamp(value: unknown): {
  at: Date | null;
  pending: boolean;
} {
  if (isBlankMarker(value)) return { at: null, pending: true };
  const s = cellStr(value);
  if (!s) return { at: null, pending: false };
  if (s.startsWith("未")) return { at: null, pending: true };
  return { at: parseExcelDate(value), pending: false };
}

function parseIntSafe(value: unknown, fallback = 0): number {
  if (value == null || value === "" || isBlankMarker(value)) return fallback;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseRemaining(value: unknown): {
  remainingDays: number | null;
  remainingEnded: boolean;
} {
  if (value == null || value === "" || isBlankMarker(value)) {
    return { remainingDays: null, remainingEnded: false };
  }
  const s = cellStr(value);
  if (s === "已结束") return { remainingDays: null, remainingEnded: true };
  const n = Number(s);
  if (!Number.isFinite(n)) return { remainingDays: null, remainingEnded: false };
  return { remainingDays: Math.trunc(n), remainingEnded: false };
}

function parseQualified(value: unknown): boolean {
  const s = cellStr(value);
  if (!s || s === "未达标" || s === "不达标" || s === "否") return false;
  return s === "已达标" || s === "达标" || s === "是";
}

/** 加工表特征：所属经理 + 是否达标 + 考核期字段（排除「原始表格」） */
function isProcessedN7Sheet(headers: string[]): boolean {
  const normalized = headers.map(normalizeHeader);
  const has = (name: string) => normalized.includes(name);
  const hasRemaining = normalized.some(
    (h) => h === "剩余考核天数" || h.startsWith("剩余考核")
  );
  return (
    Boolean(findColumnKey(headers, "deviceSn")) &&
    has("所属经理") &&
    Boolean(findColumnKey(headers, "operatorName")) &&
    has("是否达标") &&
    (has("考核开始时间") || has("考核结束时间") || hasRemaining)
  );
}

function pickProcessedSheet(workbook: XLSX.WorkBook): {
  sheetName: string;
  raw: Record<string, unknown>[];
} | null {
  for (const sheetName of workbook.SheetNames) {
    // 明确跳过裸表名
    if (normalizeHeader(sheetName) === "原始表格") continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });
    if (raw.length === 0) continue;
    const headers = Object.keys(raw[0] ?? {});
    if (isProcessedN7Sheet(headers)) {
      return { sheetName, raw };
    }
  }
  return null;
}

export function parseN7ExcelBuffer(buffer: Buffer): {
  rows: ParsedN7DeviceRow[];
  errors: string[];
  sheetName?: string;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (workbook.SheetNames.length === 0) {
    return { rows: [], errors: ["Excel 中没有任何工作表"] };
  }

  const picked = pickProcessedSheet(workbook);
  if (!picked) {
    return {
      rows: [],
      errors: [
        "未找到加工后的 N7 考核表。请只上传含「设备SN / 作业人员 / 所属经理 / 是否达标 / 考核开始时间」的加工表（如「7.15」），不要上传「原始表格」。",
      ],
    };
  }

  const { sheetName, raw } = picked;
  const headers = Object.keys(raw[0] ?? {});
  const col = {
    deviceSn: findColumnKey(headers, "deviceSn"),
    registeredAt: findColumnKey(headers, "registeredAt"),
    litAt: findColumnKey(headers, "litAt"),
    subscribedAt: findColumnKey(headers, "subscribedAt"),
    firstCheckInAt: findColumnKey(headers, "firstCheckInAt"),
    assessmentStartAt: findColumnKey(headers, "assessmentStartAt"),
    assessmentEndAt: findColumnKey(headers, "assessmentEndAt"),
    remainingDays: findColumnKey(headers, "remainingDays"),
    effectiveDays: findColumnKey(headers, "effectiveDays"),
    effectiveUsers: findColumnKey(headers, "effectiveUsers"),
    isQualified: findColumnKey(headers, "isQualified"),
    operatorName: findColumnKey(headers, "operatorName"),
    managerName: findColumnKey(headers, "managerName"),
    companyName: findColumnKey(headers, "companyName"),
    phase2Days: findColumnKey(headers, "phase2Days"),
    phase2Users: findColumnKey(headers, "phase2Users"),
    storeId: findColumnKey(headers, "storeId"),
    storeName: findColumnKey(headers, "storeName"),
    storeAddress: findColumnKey(headers, "storeAddress"),
    storePhone: findColumnKey(headers, "storePhone"),
    merchantId: findColumnKey(headers, "merchantId"),
    merchantAccount: findColumnKey(headers, "merchantAccount"),
    merchantPhone: findColumnKey(headers, "merchantPhone"),
  };

  if (!col.deviceSn || !col.operatorName || !col.managerName) {
    return {
      rows: [],
      errors: ["加工表缺少必填列：设备SN / 作业人员 / 所属经理"],
      sheetName,
    };
  }

  const rows: ParsedN7DeviceRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  raw.forEach((record, index) => {
    const rowIndex = index + 2;
    const deviceSn = cellStr(record[col.deviceSn!]);
    if (!deviceSn || isBlankMarker(deviceSn)) {
      errors.push(`第 ${rowIndex} 行：设备SN 为空，已跳过`);
      return;
    }
    if (seen.has(deviceSn)) {
      errors.push(`第 ${rowIndex} 行：设备SN 重复 ${deviceSn}，已跳过`);
      return;
    }
    seen.add(deviceSn);

    const lit = parseSpecialTimestamp(col.litAt ? record[col.litAt] : null);
    const sub = parseSpecialTimestamp(
      col.subscribedAt ? record[col.subscribedAt] : null
    );
    const checkIn = parseSpecialTimestamp(
      col.firstCheckInAt ? record[col.firstCheckInAt] : null
    );
    const remaining = parseRemaining(
      col.remainingDays ? record[col.remainingDays] : null
    );

    const storeIdRaw = col.storeId ? record[col.storeId] : null;
    const storeNameRaw = col.storeName ? record[col.storeName] : null;
    const companyRaw = col.companyName ? record[col.companyName] : null;

    rows.push({
      deviceSn,
      registeredAt: col.registeredAt
        ? parseExcelDate(record[col.registeredAt])
        : null,
      litAt: lit.at,
      subscribedAt: sub.at,
      firstCheckInAt: checkIn.at,
      notLit: lit.pending,
      notSubscribed: sub.pending,
      notCheckedIn: checkIn.pending,
      assessmentStartAt: col.assessmentStartAt
        ? parseExcelDate(record[col.assessmentStartAt])
        : null,
      assessmentEndAt: col.assessmentEndAt
        ? parseExcelDate(record[col.assessmentEndAt])
        : null,
      remainingDays: remaining.remainingDays,
      remainingEnded: remaining.remainingEnded,
      effectiveDays: parseIntSafe(
        col.effectiveDays ? record[col.effectiveDays] : 0
      ),
      effectiveUsers: parseIntSafe(
        col.effectiveUsers ? record[col.effectiveUsers] : 0
      ),
      isQualified: parseQualified(
        col.isQualified ? record[col.isQualified] : null
      ),
      operatorName: cellStr(record[col.operatorName!]) || "未知",
      managerName: cellStr(record[col.managerName!]) || "未知",
      companyName: isBlankMarker(companyRaw) ? null : cellStr(companyRaw) || null,
      phase2Days: parseIntSafe(col.phase2Days ? record[col.phase2Days] : 0),
      phase2Users: parseIntSafe(col.phase2Users ? record[col.phase2Users] : 0),
      storeId: isBlankMarker(storeIdRaw) ? null : cellStr(storeIdRaw) || null,
      storeName: isBlankMarker(storeNameRaw)
        ? null
        : cellStr(storeNameRaw) || null,
      storeAddress: col.storeAddress
        ? isBlankMarker(record[col.storeAddress])
          ? null
          : cellStr(record[col.storeAddress]) || null
        : null,
      storePhone: col.storePhone
        ? isBlankMarker(record[col.storePhone])
          ? null
          : cellStr(record[col.storePhone]) || null
        : null,
      merchantId: col.merchantId
        ? isBlankMarker(record[col.merchantId])
          ? null
          : cellStr(record[col.merchantId]) || null
        : null,
      merchantAccount: col.merchantAccount
        ? isBlankMarker(record[col.merchantAccount])
          ? null
          : cellStr(record[col.merchantAccount]) || null
        : null,
      merchantPhone: col.merchantPhone
        ? isBlankMarker(record[col.merchantPhone])
          ? null
          : cellStr(record[col.merchantPhone]) || null
        : null,
      rowIndex,
    });
  });

  return { rows, errors, sheetName };
}
