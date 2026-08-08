/** 沉睡预警：≥2 天未交易视为沉睡；单笔沉默单独标记（更严重） */

import { xlvStatDateKey } from "@/lib/xlv-stat-date";
import { computeXlvMonthAssessmentTotals } from "@/services/xlv/snapshot-daily";

export const XLV_SLEEP_THRESHOLD_DAYS = 2;

/** 今日待办：沉睡 ≥N 天未回访升 P0 */
export const XLV_TODAY_URGENT_SLEEP_DAYS = 7;

/** 今日待办：考核窗口剩余 ≤N 天仍未达标 */
export const XLV_ASSESSMENT_EXPIRING_DAYS = 15;

export type XlvTodayPriority = "P0" | "P1" | "P2";

/** 自然月考核目标（首笔交易月为装机月，最多考核两个自然月） */
export const XLV_MONTHLY_USER_TARGET = 20;
export const XLV_MONTHLY_TXN_TARGET = 300;

export type XlvQualificationStatus = "qualified" | "in_progress" | "invalid";

export function isXlvMonthlyTargetMet(users: number, txns: number) {
  return (
    users >= XLV_MONTHLY_USER_TARGET && txns >= XLV_MONTHLY_TXN_TARGET
  );
}

/** 累计值已明显达标（快照不足时的兜底） */
export function isXlvCumulativeQualified(device: {
  cumulativeUsers: number;
  cumulativeTxns: number;
}) {
  return isXlvMonthlyTargetMet(device.cumulativeUsers, device.cumulativeTxns);
}

type XlvSnapshotPoint = {
  deviceSn?: string;
  statDate: Date;
  lastTxnDate?: Date | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  dailyUsers?: number;
  dailyTxns?: number;
  sleepDays?: number;
};

function utcYearMonth(d: Date) {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

type YearMonth = { y: number; m: number };

/** 考核日历月：按中国自然日，与导入 statDate 一致 */
function chinaYearMonth(d: Date): YearMonth {
  const key = xlvStatDateKey(d);
  const [y, m] = key.split("-").map(Number);
  return { y: y!, m: m! };
}

function compareYearMonth(a: YearMonth, b: YearMonth) {
  return a.y !== b.y ? a.y - b.y : a.m - b.m;
}

function nextYearMonth(y: number, m: number): YearMonth {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
}

function qualificationAsOf(asOf?: Date) {
  return asOf ?? new Date();
}

function isAssessmentWindowClosed(reference: Date, secondMonthY: number, secondMonthM: number) {
  const afterSecond = nextYearMonth(secondMonthY, secondMonthM);
  return compareYearMonth(chinaYearMonth(reference), afterSecond) >= 0;
}

function pickAssessmentFocusMonth(
  reference: Date,
  months: XlvQualificationMonthRow[],
  secondMonthY: number,
  secondMonthM: number
) {
  const second: YearMonth = { y: secondMonthY, m: secondMonthM };
  if (compareYearMonth(chinaYearMonth(reference), second) >= 0) {
    return months[1] ?? months[0] ?? null;
  }
  return months[0] ?? null;
}

/** 方案 A：按实际收款日汇总判定达标 / 考核中 / 无效 */
export function assessXlvQualification(
  device: {
    firstTxnDate: Date | null;
    statDate?: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  snapshots: XlvSnapshotPoint[],
  asOf?: Date,
  snapshotsPreEnriched = false
): XlvQualificationStatus {
  if (isXlvCumulativeQualified(device)) return "qualified";
  if (!device.firstTxnDate) return "in_progress";

  const points = [...snapshots].sort(
    (a, b) => a.statDate.getTime() - b.statDate.getTime()
  );
  const reference = qualificationAsOf(asOf);

  const { y: y0, m: m0 } = utcYearMonth(device.firstTxnDate);
  const y1 = m0 === 12 ? y0 + 1 : y0;
  const m1 = m0 === 12 ? 1 : m0 + 1;

  const inc0 = computeXlvMonthAssessmentTotals(
    points,
    y0,
    m0,
    device,
    true,
    snapshotsPreEnriched
  );
  if (inc0 && isXlvMonthlyTargetMet(inc0.users, inc0.txns)) return "qualified";

  const inc1 = computeXlvMonthAssessmentTotals(
    points,
    y1,
    m1,
    device,
    false,
    snapshotsPreEnriched
  );
  if (inc1 && isXlvMonthlyTargetMet(inc1.users, inc1.txns)) return "qualified";

  if (isAssessmentWindowClosed(reference, y1, m1)) return "invalid";

  return "in_progress";
}

/** 距两月考核窗口结束还剩多少天（已结束返回 null） */
export function getXlvAssessmentDaysRemaining(
  firstTxnDate: Date | null,
  asOf: Date = new Date()
): number | null {
  if (!firstTxnDate) return null;

  const { y: y0, m: m0 } = utcYearMonth(firstTxnDate);
  const y1 = m0 === 12 ? y0 + 1 : y0;
  const m1 = m0 === 12 ? 1 : m0 + 1;
  const windowEndExclusive = new Date(Date.UTC(y1, m1, 1));

  const asOfDay = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  );
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.ceil(
    (windowEndExclusive.getTime() - asOfDay.getTime()) / msPerDay
  );
  if (days <= 0) return null;
  return days;
}

export function isXlvAssessmentExpiringSoon(
  device: {
    firstTxnDate: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  snapshots: XlvSnapshotPoint[],
  asOf?: Date,
  threshold = XLV_ASSESSMENT_EXPIRING_DAYS
): boolean {
  if (assessXlvQualification(device, snapshots, asOf) !== "in_progress") {
    return false;
  }
  const remaining = getXlvAssessmentDaysRemaining(
    device.firstTxnDate,
    qualificationAsOf(asOf)
  );
  return remaining != null && remaining <= threshold;
}

export function classifyXlvTodayPriority(input: {
  sleepDays: number;
  cumulativeTxns: number;
  followUpDone: boolean;
  qualificationStatus: XlvQualificationStatus;
  firstTxnDate: Date | null;
  assessmentDaysLeft: number | null;
}): XlvTodayPriority | null {
  const alert = classifyXlvAlert({
    sleepDays: input.sleepDays,
    cumulativeTxns: input.cumulativeTxns,
  });
  const isSleep = alert === "single_silence" || alert === "dormant";

  if (!input.followUpDone && isSleep) {
    if (
      alert === "single_silence" ||
      input.sleepDays >= XLV_TODAY_URGENT_SLEEP_DAYS
    ) {
      return "P0";
    }
    return "P1";
  }

  if (
    input.qualificationStatus === "in_progress" &&
    input.assessmentDaysLeft != null &&
    input.assessmentDaysLeft <= XLV_ASSESSMENT_EXPIRING_DAYS
  ) {
    return "P2";
  }

  return null;
}

export function xlvTodayReason(input: {
  priority: XlvTodayPriority;
  alertKind: XlvDeviceAlertKind;
  sleepDays: number;
  assessmentDaysLeft: number | null;
}): string {
  if (input.priority === "P0") {
    if (input.alertKind === "single_silence") {
      return `单笔沉默 · 沉睡 ${input.sleepDays} 天`;
    }
    return `沉睡 ${input.sleepDays} 天未回访`;
  }
  if (input.priority === "P1") {
    return `沉睡 ${input.sleepDays} 天待回访`;
  }
  if (input.assessmentDaysLeft != null) {
    return `考核剩余 ${input.assessmentDaysLeft} 天`;
  }
  return "考核将到期";
}

export function isXlvDeviceQualified(
  device: {
    firstTxnDate: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  snapshots: XlvSnapshotPoint[] = []
) {
  return assessXlvQualification(device, snapshots) === "qualified";
}

export const XLV_QUALIFICATION_LABELS: Record<XlvQualificationStatus, string> = {
  qualified: "已达标",
  in_progress: "考核中",
  invalid: "无效用户",
};

export const XLV_QUALIFICATION_HINTS: Record<XlvQualificationStatus, string> = {
  qualified: "自然月内达到 20 用户 + 300 笔",
  in_progress: "考核窗口内，尚未达标",
  invalid: "两月均未达标",
};

export const XLV_QUALIFICATION_FILTERS: {
  id: XlvQualificationStatus;
  label: string;
}[] = [
  { id: "qualified", label: XLV_QUALIFICATION_LABELS.qualified },
  { id: "in_progress", label: XLV_QUALIFICATION_LABELS.in_progress },
  { id: "invalid", label: XLV_QUALIFICATION_LABELS.invalid },
];

export function parseXlvQualificationStatus(
  raw: string | null | undefined
): XlvQualificationStatus | null {
  if (raw === "qualified" || raw === "in_progress" || raw === "invalid") {
    return raw;
  }
  return null;
}

export type XlvQualificationMonthRow = {
  label: string;
  period: string;
  users: number | null;
  txns: number | null;
  met: boolean;
  /** 无日快照，用设备累计估算 */
  estimated?: boolean;
};

export type XlvQualificationDetail = {
  status: XlvQualificationStatus;
  usersGap: number;
  txnsGap: number;
  focusMonth: XlvQualificationMonthRow | null;
  months: XlvQualificationMonthRow[];
};

function formatYearMonth(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** 考核进度：当月增量、缺口、两月窗口明细 */
export function getXlvQualificationDetail(
  device: {
    firstTxnDate: Date | null;
    statDate?: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  snapshots: XlvSnapshotPoint[],
  asOf?: Date,
  snapshotsPreEnriched = false
): XlvQualificationDetail {
  const points = [...snapshots].sort(
    (a, b) => a.statDate.getTime() - b.statDate.getTime()
  );
  const reference = qualificationAsOf(asOf);
  const status = assessXlvQualification(
    device,
    snapshots,
    reference,
    snapshotsPreEnriched
  );

  if (!device.firstTxnDate) {
    return {
      status,
      usersGap: XLV_MONTHLY_USER_TARGET,
      txnsGap: XLV_MONTHLY_TXN_TARGET,
      focusMonth: null,
      months: [],
    };
  }

  const { y: y0, m: m0 } = utcYearMonth(device.firstTxnDate);
  const y1 = m0 === 12 ? y0 + 1 : y0;
  const m1 = m0 === 12 ? 1 : m0 + 1;

  const monthDefs = [
    { label: "装机月", y: y0, m: m0 },
    { label: "次月", y: y1, m: m1 },
  ] as const;

  const months: XlvQualificationMonthRow[] = monthDefs.map(({ label, y, m }) => {
    const inc = computeXlvMonthAssessmentTotals(
      points,
      y,
      m,
      device,
      label === "装机月",
      snapshotsPreEnriched
    );
    return {
      label,
      period: formatYearMonth(y, m),
      users: inc?.users ?? null,
      txns: inc?.txns ?? null,
      met: inc ? isXlvMonthlyTargetMet(inc.users, inc.txns) : false,
      estimated: inc?.estimated,
    };
  });

  let focusMonth: XlvQualificationMonthRow | null = null;
  if (status === "qualified") {
    focusMonth = months.find((row) => row.met) ?? months[0] ?? null;
  } else if (status === "invalid") {
    focusMonth = months[1] ?? months[0] ?? null;
  } else {
    focusMonth = pickAssessmentFocusMonth(reference, months, y1, m1);
  }

  const focusUsers = focusMonth?.users ?? 0;
  const focusTxns = focusMonth?.txns ?? 0;
  const usersGap =
    status === "qualified"
      ? 0
      : Math.max(0, XLV_MONTHLY_USER_TARGET - focusUsers);
  const txnsGap =
    status === "qualified"
      ? 0
      : Math.max(0, XLV_MONTHLY_TXN_TARGET - focusTxns);

  return { status, usersGap, txnsGap, focusMonth, months };
}

export function xlvQualificationMonthProgressLine(detail: XlvQualificationDetail) {
  if (detail.status === "qualified" || !detail.focusMonth) return null;
  const { label, period, users, txns, estimated } = detail.focusMonth;
  if (users == null && txns == null) {
    return `${label} ${period}：无收款`;
  }
  const suffix = estimated ? "（按累计）" : "";
  return `${label} ${period}：当月 ${users ?? 0} 用户 · ${txns ?? 0} 笔${suffix}`;
}

export function xlvQualificationGapLine(detail: XlvQualificationDetail) {
  if (detail.status === "qualified") return "已达标";
  if (!detail.focusMonth) return "待首笔交易";
  const parts: string[] = [];
  if (detail.usersGap > 0) {
    parts.push(
      detail.txnsGap === 0
        ? `笔数已达标·差 ${detail.usersGap} 用户`
        : `差 ${detail.usersGap} 用户`
    );
  }
  if (detail.txnsGap > 0) {
    parts.push(
      detail.usersGap === 0
        ? `用户已达标·差 ${detail.txnsGap} 笔`
        : `差 ${detail.txnsGap} 笔`
    );
  }
  const gapText = parts.length ? parts.join(" · ") : "当月接近达标";
  if (detail.focusMonth?.label === "次月") {
    return `次月重计 · ${gapText}`;
  }
  if (detail.focusMonth?.label === "装机月") {
    return `装机月 · ${gapText}`;
  }
  return gapText;
}

export function xlvQualificationMonthResultLabel(row: XlvQualificationMonthRow) {
  if (row.met) return { tone: "success" as const, text: "达标" };
  if (row.users == null && row.txns == null) {
    return { tone: "muted" as const, text: "无收款" };
  }
  const users = row.users ?? 0;
  const txns = row.txns ?? 0;
  if (users >= XLV_MONTHLY_USER_TARGET && txns < XLV_MONTHLY_TXN_TARGET) {
    return {
      tone: "warn" as const,
      text: `用户已达标·差 ${XLV_MONTHLY_TXN_TARGET - txns} 笔`,
    };
  }
  if (txns >= XLV_MONTHLY_TXN_TARGET && users < XLV_MONTHLY_USER_TARGET) {
    return {
      tone: "warn" as const,
      text: `笔数已达标·差 ${XLV_MONTHLY_USER_TARGET - users} 用户`,
    };
  }
  const parts: string[] = [];
  if (users < XLV_MONTHLY_USER_TARGET) {
    parts.push(`差 ${XLV_MONTHLY_USER_TARGET - users} 用户`);
  }
  if (txns < XLV_MONTHLY_TXN_TARGET) {
    parts.push(`差 ${XLV_MONTHLY_TXN_TARGET - txns} 笔`);
  }
  return { tone: "warn" as const, text: parts.join(" · ") || "未达标" };
}

/** 未挂经理的设备池（运营表无经理字段），不是具体负责人 */
export const XLV_INVENTORY_MANAGER_LABEL = "剩余库存";
export const XLV_INVENTORY_MANAGER_KEY = `name:${XLV_INVENTORY_MANAGER_LABEL}`;

export function isXlvUnassignedManager(record: {
  managerUserId: string | null;
  managerName: string;
}) {
  return record.managerUserId == null && !record.managerName?.trim();
}

export function isXlvInventoryManagerKey(managerKey: string) {
  return managerKey === XLV_INVENTORY_MANAGER_KEY;
}

export function xlvManagerDisplayName(managerName: string) {
  return managerName?.trim() || XLV_INVENTORY_MANAGER_LABEL;
}

/** 作业员与经理同名：经理本人拓展，不视为缺作业员账号 */
export function isXlvManagerSelfSale(record: {
  operatorName: string;
  managerName: string;
}) {
  const operator = record.operatorName?.trim();
  const manager = record.managerName?.trim();
  return !!operator && !!manager && operator === manager;
}

/** 占位姓名（SN 归属表常见「待定」等） */
export const XLV_PLACEHOLDER_NAMES = new Set([
  "待定",
  "TBD",
  "未知",
  "—",
  "-",
  "/",
]);

export function isXlvPlaceholderName(name: string | null | undefined): boolean {
  const n = name?.trim() ?? "";
  if (!n) return true;
  return XLV_PLACEHOLDER_NAMES.has(n);
}

/** 经理自营拓展：作业员=经理且经理姓名有效 */
export function isXlvManagerSelfSaleResolved(record: {
  operatorName: string;
  managerName: string;
}) {
  return (
    isXlvManagerSelfSale(record) && !isXlvPlaceholderName(record.managerName)
  );
}

/** 作业员姓名缺失或为占位（经理自营除外） */
export function isXlvOperatorAttributionMissing(record: {
  operatorName: string;
  managerName: string;
}) {
  if (isXlvManagerSelfSaleResolved(record)) return false;
  return isXlvPlaceholderName(record.operatorName);
}

/** 经理姓名缺失或为占位 */
export function isXlvManagerAttributionMissing(record: {
  managerName: string;
}) {
  return isXlvPlaceholderName(record.managerName);
}

export function xlvRosterPairKey(managerName: string, operatorName: string) {
  return `${managerName.trim()}::${operatorName.trim()}`;
}

/** 作业员+经理组合不在组织名册中（名册为空时不判） */
export function isXlvOperatorNotInRoster(
  record: { operatorName: string; managerName: string },
  rosterPairs: ReadonlySet<string>
) {
  if (rosterPairs.size === 0) return false;
  if (isXlvManagerSelfSaleResolved(record)) return false;
  const operator = record.operatorName?.trim();
  const manager = record.managerName?.trim();
  if (!operator || isXlvPlaceholderName(operator)) return false;
  if (!manager || isXlvPlaceholderName(manager)) return false;
  return !rosterPairs.has(xlvRosterPairKey(manager, operator));
}

export type XlvDeviceAlertKind = "single_silence" | "dormant" | "active";

/** 列表/API 筛选；`sleep` = 单笔沉默 + 沉睡（沉睡预警 Tab 默认） */
export type XlvAlertKind = "all" | "sleep" | XlvDeviceAlertKind;

export function classifyXlvAlert(device: {
  sleepDays: number;
  cumulativeTxns: number;
}): XlvDeviceAlertKind {
  if (
    device.cumulativeTxns === 1 &&
    device.sleepDays >= XLV_SLEEP_THRESHOLD_DAYS
  ) {
    return "single_silence";
  }
  if (device.sleepDays >= XLV_SLEEP_THRESHOLD_DAYS) {
    return "dormant";
  }
  return "active";
}

/** 近期有收款且尚未考核达标（不含已达标） */
export function isXlvActiveInProgress(device: {
  sleepDays: number;
  cumulativeTxns: number;
  qualificationStatus?: XlvQualificationStatus | null;
}) {
  return (
    classifyXlvAlert(device) === "active" &&
    device.qualificationStatus !== "qualified"
  );
}

export const XLV_ACTIVE_IN_PROGRESS_LABEL = "正在活跃中";

export const XLV_ALERT_LABELS: Record<XlvDeviceAlertKind, string> = {
  single_silence: "单笔沉默",
  dormant: "沉睡",
  active: "正常",
};

export const XLV_ALERT_HINTS: Record<XlvDeviceAlertKind, string> = {
  single_silence: "仅 1 笔且 ≥2 天未用",
  dormant: "≥2 天无交易（已分配）",
  active: "已分配且近期有收款",
};

export const XLV_ALERT_FILTERS: {
  id: XlvDeviceAlertKind;
  label: string;
  hint: string;
}[] = [
  { id: "single_silence", label: XLV_ALERT_LABELS.single_silence, hint: XLV_ALERT_HINTS.single_silence },
  { id: "dormant", label: XLV_ALERT_LABELS.dormant, hint: XLV_ALERT_HINTS.dormant },
  { id: "active", label: XLV_ALERT_LABELS.active, hint: XLV_ALERT_HINTS.active },
];

export function xlvMerchantLabel(row: {
  merchantName?: string | null;
  activationMerchantName?: string | null;
}) {
  const name = row.merchantName?.trim() || row.activationMerchantName?.trim();
  return name || "未命名商户";
}

export function parseXlvAlertKind(raw: string | null | undefined): XlvAlertKind {
  if (
    raw === "sleep" ||
    raw === "single_silence" ||
    raw === "dormant" ||
    raw === "active" ||
    raw === "all"
  ) {
    return raw;
  }
  return "all";
}
