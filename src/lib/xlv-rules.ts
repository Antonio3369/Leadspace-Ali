/** 沉睡预警：≥2 天未交易视为沉睡；单笔沉默单独标记（更严重） */

export const XLV_SLEEP_THRESHOLD_DAYS = 2;

/** 今日待办：沉睡 ≥N 天未回访升 P0 */
export const XLV_TODAY_URGENT_SLEEP_DAYS = 7;

/** 今日待办：考核窗口剩余 ≤N 天仍未达标 */
export const XLV_ASSESSMENT_EXPIRING_DAYS = 7;

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
  statDate: Date;
  cumulativeUsers: number;
  cumulativeTxns: number;
};

function utcYearMonth(d: Date) {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

function lastSnapshotInMonth(points: XlvSnapshotPoint[], y: number, m: number) {
  const inMonth = points.filter((p) => {
    const ym = utcYearMonth(p.statDate);
    return ym.y === y && ym.m === m;
  });
  return inMonth.length ? inMonth[inMonth.length - 1]! : null;
}

function monthIncrement(
  points: XlvSnapshotPoint[],
  y: number,
  m: number
): { users: number; txns: number } | null {
  const end = lastSnapshotInMonth(points, y, m);
  if (!end) return null;
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const before = points.filter((p) => p.statDate < monthStart);
  const baseline = before.length ? before[before.length - 1]! : null;
  return {
    users: end.cumulativeUsers - (baseline?.cumulativeUsers ?? 0),
    txns: end.cumulativeTxns - (baseline?.cumulativeTxns ?? 0),
  };
}

/** 方案 A：按快照自然月增量判定达标 / 考核中 / 无效 */
export function assessXlvQualification(
  device: {
    firstTxnDate: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  snapshots: XlvSnapshotPoint[],
  asOf?: Date
): XlvQualificationStatus {
  if (isXlvCumulativeQualified(device)) return "qualified";
  if (!device.firstTxnDate) return "in_progress";

  const points = [...snapshots].sort(
    (a, b) => a.statDate.getTime() - b.statDate.getTime()
  );
  const reference =
    asOf ?? (points.length ? points[points.length - 1]!.statDate : new Date());

  const { y: y0, m: m0 } = utcYearMonth(device.firstTxnDate);
  const y1 = m0 === 12 ? y0 + 1 : y0;
  const m1 = m0 === 12 ? 1 : m0 + 1;

  const inc0 = monthIncrement(points, y0, m0);
  if (inc0 && isXlvMonthlyTargetMet(inc0.users, inc0.txns)) return "qualified";

  const inc1 = monthIncrement(points, y1, m1);
  if (inc1 && isXlvMonthlyTargetMet(inc1.users, inc1.txns)) return "qualified";

  const windowEnd = new Date(Date.UTC(y1, m1, 1));
  if (reference >= windowEnd) return "invalid";

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
    asOf ?? (snapshots.length ? snapshots[snapshots.length - 1]!.statDate : new Date())
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
  alertKind: Exclude<XlvAlertKind, "all">;
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
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  snapshots: XlvSnapshotPoint[],
  asOf?: Date
): XlvQualificationDetail {
  const points = [...snapshots].sort(
    (a, b) => a.statDate.getTime() - b.statDate.getTime()
  );
  const reference =
    asOf ?? (points.length ? points[points.length - 1]!.statDate : new Date());
  const status = assessXlvQualification(device, snapshots, reference);

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
    const inc = monthIncrement(points, y, m);
    return {
      label,
      period: formatYearMonth(y, m),
      users: inc?.users ?? null,
      txns: inc?.txns ?? null,
      met: inc ? isXlvMonthlyTargetMet(inc.users, inc.txns) : false,
    };
  });

  let focusMonth: XlvQualificationMonthRow | null = null;
  if (status === "qualified") {
    focusMonth = months.find((row) => row.met) ?? months[0] ?? null;
  } else if (status === "invalid") {
    focusMonth = months[1] ?? months[0] ?? null;
  } else {
    const windowEnd = new Date(Date.UTC(y1, m1, 1));
    const inMonth1 = reference >= new Date(Date.UTC(y0, m0 === 12 ? 0 : m0, 1));
    focusMonth = inMonth1 && reference < windowEnd ? months[1] ?? null : months[0] ?? null;
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

export function xlvQualificationGapLine(detail: XlvQualificationDetail) {
  if (detail.status === "qualified") return "已达标";
  if (!detail.focusMonth) return "待首笔交易";
  const parts: string[] = [];
  if (detail.usersGap > 0) parts.push(`差 ${detail.usersGap} 用户`);
  if (detail.txnsGap > 0) parts.push(`差 ${detail.txnsGap} 笔`);
  return parts.length ? parts.join(" · ") : "当月接近达标";
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

export type XlvAlertKind = "all" | "single_silence" | "dormant" | "active";

export function classifyXlvAlert(device: {
  sleepDays: number;
  cumulativeTxns: number;
}): Exclude<XlvAlertKind, "all"> {
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

export const XLV_ALERT_LABELS: Record<Exclude<XlvAlertKind, "all">, string> = {
  single_silence: "单笔沉默",
  dormant: "沉睡",
  active: "正常",
};

export const XLV_ALERT_HINTS: Record<Exclude<XlvAlertKind, "all">, string> = {
  single_silence: "仅 1 笔且 ≥2 天未用",
  dormant: "≥2 天无交易（已分配）",
  active: "已分配且近期有收款",
};

export const XLV_ALERT_FILTERS: {
  id: Exclude<XlvAlertKind, "all">;
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
    raw === "single_silence" ||
    raw === "dormant" ||
    raw === "active" ||
    raw === "all"
  ) {
    return raw;
  }
  return "all";
}
