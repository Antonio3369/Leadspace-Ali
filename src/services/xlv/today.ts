import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import {
  classifyXlvAlert,
  classifyXlvTodayPriority,
  getXlvAssessmentDaysRemaining,
  getXlvQualificationDetail,
  type XlvTodayPriority,
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
    followUpDone: boolean;
    followUpNote: string | null;
    followUpAt: Date | null;
    followUpConnectStatus: string | null;
    followUpFlags: string[];
  },
  snapshotMap: Awaited<ReturnType<typeof loadXlvSnapshotMap>>,
  priority: XlvTodayPriority,
  assessmentDaysLeft: number | null
): XlvTodayDeviceItem {
  const snapshots = snapshotMap.get(row.deviceSn) ?? [];
  const detail = getXlvQualificationDetail(row, snapshots);
  const alertKind = classifyXlvAlert({
    sleepDays: row.sleepDays,
    cumulativeTxns: row.cumulativeTxns,
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
    qualificationGapLine: xlvQualificationGapLine(detail),
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
    operatorName: opts?.operatorName,
    search: opts?.search,
  });

  const rows = await db.xlvDeviceRecord.findMany({
    where: scopeWhere,
    select: {
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
    },
  });

  const snapshotMap = await loadXlvSnapshotMap(rows.map((r) => r.deviceSn));
  const enriched = attachXlvQualificationDetails(rows, snapshotMap);

  const buckets: Record<XlvTodayPriority, XlvTodayDeviceItem[]> = {
    P0: [],
    P1: [],
    P2: [],
  };

  for (const row of enriched) {
    const snapshots = snapshotMap.get(row.deviceSn) ?? [];
    const asOf =
      row.statDate ??
      (snapshots.length ? snapshots[snapshots.length - 1]!.statDate : new Date());
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

    buckets[priority].push(
      mapTodayDevice(row, snapshotMap, priority, assessmentDaysLeft)
    );
  }

  const queues = {
    P0: sortTodayQueue(buckets.P0, "P0").slice(0, XLV_TODAY_LIST_CAP),
    P1: sortTodayQueue(buckets.P1, "P1").slice(0, XLV_TODAY_LIST_CAP),
    P2: sortTodayQueue(buckets.P2, "P2").slice(0, XLV_TODAY_LIST_CAP),
  };

  const counts = {
    P0: buckets.P0.length,
    P1: buckets.P1.length,
    P2: buckets.P2.length,
    pendingFollowUp: buckets.P0.length + buckets.P1.length,
    total: buckets.P0.length + buckets.P1.length + buckets.P2.length,
  };

  const searchMode = Boolean(opts?.search?.trim());

  return {
    searchMode,
    counts,
    queues,
    listCap: XLV_TODAY_LIST_CAP,
  };
}
