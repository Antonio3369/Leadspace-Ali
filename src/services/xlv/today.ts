import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import {
  classifyXlvAlert,
  classifyXlvTodayPriority,
  getXlvAssessmentDaysRemaining,
  XLV_MONTHLY_TXN_TARGET,
  XLV_MONTHLY_USER_TARGET,
  XLV_SLEEP_THRESHOLD_DAYS,
  type XlvTodayPriority,
  xlvEffectiveAlertKind,
  xlvQualificationGapLine,
  xlvTodayReason,
} from "@/lib/xlv-rules";
import type { XlvFollowUpDeviceItem } from "@/services/xlv/follow-up";
import {
  assertCanViewXlv,
  buildXlvDeviceWhere,
} from "@/services/xlv/xlv-scope";
import {
  attachXlvQualificationDetails,
  loadXlvSnapshotMap,
} from "@/services/xlv/assessment";
import { sortXlvDevices } from "@/services/xlv/sort-devices";

export const XLV_TODAY_LIST_CAP = 40;

export type XlvTodayDeviceItem = XlvFollowUpDeviceItem & {
  todayPriority: XlvTodayPriority;
  todayReason: string;
  assessmentDaysLeft: number | null;
};

function isoDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

function mapTodayDevice(
  row: {
    deviceSn: string;
    merchantName: string | null;
    activationMerchantName: string | null;
    operatorName: string;
    managerName: string;
    companyName: string | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
    sleepDays: number;
    lastTxnDate: Date | null;
    firstTxnDate: Date | null;
    qualificationStatus: import("@/lib/xlv-rules").XlvQualificationStatus;
    qualificationDetail: import("@/lib/xlv-rules").XlvQualificationDetail;
    followUpDone: boolean;
    followUpNote: string | null;
    followUpAt: Date | null;
    followUpConnectStatus: string | null;
    followUpFlags: string[];
  },
  priority: XlvTodayPriority,
  assessmentDaysLeft: number | null
): XlvTodayDeviceItem {
  const alertKind = xlvEffectiveAlertKind({
    sleepDays: row.sleepDays,
    cumulativeTxns: row.cumulativeTxns,
    qualificationStatus: row.qualificationStatus,
  });

  return {
    deviceSn: row.deviceSn,
    merchantName: row.merchantName,
    activationMerchantName: row.activationMerchantName,
    operatorName: row.operatorName,
    managerName: row.managerName,
    companyName: row.companyName,
    cumulativeUsers: row.cumulativeUsers,
    cumulativeTxns: row.cumulativeTxns,
    sleepDays: row.sleepDays,
    lastTxnDate: isoDate(row.lastTxnDate),
    firstTxnDate: isoDate(row.firstTxnDate),
    alertKind,
    qualificationStatus: row.qualificationStatus,
    qualificationGapLine: xlvQualificationGapLine(row.qualificationDetail),
    followUpDone: row.followUpDone,
    followUpNote: row.followUpNote,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    followUpConnectStatus: row.followUpConnectStatus,
    followUpFlags: row.followUpFlags ?? [],
    todayPriority: priority,
    assessmentDaysLeft,
    todayReason: xlvTodayReason({
      priority,
      alertKind,
      sleepDays: row.sleepDays,
      assessmentDaysLeft,
    }),
  };
}

function sortTodayQueue(items: XlvTodayDeviceItem[], priority: XlvTodayPriority) {
  if (priority === "P2") {
    return [...items].sort(
      (a, b) =>
        (a.assessmentDaysLeft ?? 999) - (b.assessmentDaysLeft ?? 999) ||
        b.sleepDays - a.sleepDays
    );
  }
  return sortXlvDevices(items, "risk") as XlvTodayDeviceItem[];
}

const TODAY_DEVICE_SELECT = {
  deviceSn: true,
  merchantName: true,
  activationMerchantName: true,
  operatorName: true,
  managerName: true,
  companyName: true,
  cumulativeUsers: true,
  cumulativeTxns: true,
  sleepDays: true,
  lastTxnDate: true,
  firstTxnDate: true,
  statDate: true,
  followUpDone: true,
  followUpNote: true,
  followUpAt: true,
  followUpConnectStatus: true,
  followUpFlags: true,
  qualificationStatus: true,
} as const;

/** 非搜索模式：只拉可能进 P0/P1/P2 的设备，避免全量 1000 台 + 快照 */
function buildTodayCandidateWhere(
  scopeWhere: Prisma.XlvDeviceRecordWhereInput,
  search?: string | null
): Prisma.XlvDeviceRecordWhereInput {
  if (search?.trim()) return scopeWhere;
  return {
    AND: [
      scopeWhere,
      {
        OR: [
          {
            followUpDone: false,
            sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS },
          },
          {
            firstTxnDate: { not: null },
            OR: [
              { cumulativeUsers: { lt: XLV_MONTHLY_USER_TARGET } },
              { cumulativeTxns: { lt: XLV_MONTHLY_TXN_TARGET } },
            ],
          },
        ],
      },
    ],
  };
}

export async function getXlvTodayQueues(
  user: SessionUser,
  opts?: {
    managerName?: string | null;
    operatorName?: string | null;
    search?: string | null;
  }
) {
  assertCanViewXlv(user);

  const scopeWhere = buildXlvDeviceWhere(user, {
    managerName: opts?.managerName,
    search: opts?.search,
  });

  const deviceWhere = buildTodayCandidateWhere(scopeWhere, opts?.search);

  const rows = await db.xlvDeviceRecord.findMany({
    where: deviceWhere,
    select: TODAY_DEVICE_SELECT,
  });

  const snapshotMap = await loadXlvSnapshotMap(rows.map((r) => r.deviceSn));
  const enriched = attachXlvQualificationDetails(rows, snapshotMap);

  const buckets: Record<XlvTodayPriority, XlvTodayDeviceItem[]> = {
    P0: [],
    P1: [],
    P2: [],
  };
  const operatorCounts = new Map<string, number>();

  for (const row of enriched) {
    const asOf = row.statDate ?? new Date();
    const assessmentDaysLeft = getXlvAssessmentDaysRemaining(
      row.firstTxnDate,
      asOf
    );
    const priority = classifyXlvTodayPriority({
      sleepDays: row.sleepDays,
      cumulativeTxns: row.cumulativeTxns,
      followUpDone: row.followUpDone,
      qualificationStatus: row.qualificationStatus,
      firstTxnDate: row.firstTxnDate,
      assessmentDaysLeft,
    });
    if (!priority) continue;

    const item = mapTodayDevice(row, priority, assessmentDaysLeft);
    buckets[priority].push(item);
    const operator = item.operatorName?.trim();
    if (operator) {
      operatorCounts.set(operator, (operatorCounts.get(operator) ?? 0) + 1);
    }
  }

  const operatorFilter = opts?.operatorName?.trim();
  const filteredBuckets = operatorFilter
    ? {
        P0: buckets.P0.filter((d) => d.operatorName === operatorFilter),
        P1: buckets.P1.filter((d) => d.operatorName === operatorFilter),
        P2: buckets.P2.filter((d) => d.operatorName === operatorFilter),
      }
    : buckets;

  const queues = {
    P0: sortTodayQueue(filteredBuckets.P0, "P0").slice(0, XLV_TODAY_LIST_CAP),
    P1: sortTodayQueue(filteredBuckets.P1, "P1").slice(0, XLV_TODAY_LIST_CAP),
    P2: sortTodayQueue(filteredBuckets.P2, "P2").slice(0, XLV_TODAY_LIST_CAP),
  };

  const counts = {
    P0: filteredBuckets.P0.length,
    P1: filteredBuckets.P1.length,
    P2: filteredBuckets.P2.length,
    pendingFollowUp: filteredBuckets.P0.length + filteredBuckets.P1.length,
    total:
      filteredBuckets.P0.length +
      filteredBuckets.P1.length +
      filteredBuckets.P2.length,
  };

  const searchMode = Boolean(opts?.search?.trim());

  return {
    searchMode,
    counts,
    queues,
    listCap: XLV_TODAY_LIST_CAP,
    operatorCounts: Object.fromEntries(operatorCounts),
  };
}
