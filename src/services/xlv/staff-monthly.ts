import { db } from "@/lib/db";
import { parseN7DateRange } from "@/lib/n7-date";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import type { XlvQualificationStatus } from "@/lib/xlv-rules";
import {
  xlvCalendarDayRange,
  xlvShanghaiDateTimeRange,
  xlvStatDateKey,
} from "@/lib/xlv-stat-date";
import { detectXlvWakeUpDate } from "@/lib/xlv-wake-up";
import { loadXlvSnapshotMapAfterFollowUp } from "@/services/xlv/assessment";
import {
  assertCanViewXlv,
  assertManagerOwnsXlvKey,
  buildXlvAssignedDeviceWhere,
  buildXlvManagerDeviceWhere,
  buildXlvOperationalDeviceWhere,
  buildXlvRoleWhere,
  buildXlvStaffDeviceWhere,
  xlvSessionStaffKey,
} from "@/services/xlv/xlv-scope";

export type XlvStaffMonthlyDeviceRow = {
  deviceSn: string;
  merchantName: string | null;
  firstTxnDate: string | null;
  qualificationStatus: XlvQualificationStatus;
  followUpAt: string | null;
  woken: boolean;
};

export type XlvStaffMonthlySummary = {
  expandCount: number;
  qualifiedCount: number;
  inProgressCount: number;
  invalidCount: number;
  qualifyRate: number;
  followUpCount: number;
  wakeUpCount: number;
  stillDormantCount: number;
  wakeUpRate: number;
};

function isoDate(d: Date | null | undefined) {
  return d ? xlvStatDateKey(d) || null : null;
}

function ratePercent(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export async function getXlvStaffMonthlyPerformance(
  user: SessionUser,
  opts: {
    managerKey: string;
    staffKey: string;
    dateFrom?: string | null;
    dateTo?: string | null;
    month?: string | null;
  }
) {
  assertCanViewXlv(user);

  if (user.role === "SALES") {
    const own = xlvSessionStaffKey(user);
    if (
      opts.staffKey !== own &&
      opts.staffKey !== user.id &&
      opts.staffKey !== `name:${user.name}`
    ) {
      throw new PermissionError("无权查看其他队员的绩效");
    }
  } else if (user.role === "MANAGER") {
    assertManagerOwnsXlvKey(user, opts.managerKey);
  }

  const { dateFrom, dateTo } = parseN7DateRange(opts);
  if (!dateFrom || !dateTo) {
    throw new Error("请选择有效日期范围");
  }

  const firstTxnRange = xlvCalendarDayRange(dateFrom, dateTo);
  const followUpRange = xlvShanghaiDateTimeRange(dateFrom, dateTo);

  const managerWhere = await buildXlvManagerDeviceWhere(opts.managerKey);
  const staffWhere = await buildXlvStaffDeviceWhere(opts.staffKey);
  const roleWhere = buildXlvRoleWhere(user);

  const portfolioWhere = {
    AND: [
      roleWhere,
      buildXlvOperationalDeviceWhere(),
      managerWhere,
      staffWhere,
    ],
  };
  const expandWhere = {
    AND: [portfolioWhere, { firstTxnDate: { gte: firstTxnRange.from, lte: firstTxnRange.to } }],
  };
  const followWhere = {
    AND: [
      roleWhere,
      buildXlvAssignedDeviceWhere(),
      managerWhere,
      staffWhere,
      { followUpAt: { gte: followUpRange.from, lte: followUpRange.to } },
    ],
  };

  const STAFF_MONTHLY_SELECT = {
    deviceSn: true,
    merchantName: true,
    activationMerchantName: true,
    operatorName: true,
    managerName: true,
    firstTxnDate: true,
    followUpDone: true,
    followUpAt: true,
    sleepDays: true,
    lastTxnDate: true,
    statDate: true,
    cumulativeUsers: true,
    cumulativeTxns: true,
    qualificationStatus: true,
  } as const;

  const [expanded, followed, qualifiedCount, inProgressCount, invalidCount, deployedCount, nameRow] =
    await Promise.all([
      db.xlvDeviceRecord.findMany({
        where: expandWhere,
        orderBy: { deviceSn: "asc" },
        select: STAFF_MONTHLY_SELECT,
      }),
      db.xlvDeviceRecord.findMany({
        where: followWhere,
        orderBy: { deviceSn: "asc" },
        select: STAFF_MONTHLY_SELECT,
      }),
      db.xlvDeviceRecord.count({
        where: { AND: [portfolioWhere, { qualificationStatus: "qualified" }] },
      }),
      db.xlvDeviceRecord.count({
        where: { AND: [portfolioWhere, { qualificationStatus: "in_progress" }] },
      }),
      db.xlvDeviceRecord.count({
        where: { AND: [portfolioWhere, { qualificationStatus: "invalid" }] },
      }),
      db.xlvDeviceRecord.count({ where: portfolioWhere }),
      db.xlvDeviceRecord.findFirst({
        where: portfolioWhere,
        select: { operatorName: true, managerName: true },
      }),
    ]);

  const expandCount = expanded.length;

  const snapshotMap = await loadXlvSnapshotMapAfterFollowUp(followed);

  const followUpDevices: Array<{
    device: (typeof followed)[0];
    woken: boolean;
  }> = [];

  for (const row of followed) {
    if (!row.followUpAt) continue;
    const snapshots = snapshotMap.get(row.deviceSn) ?? [];
    const wakeUpDate = detectXlvWakeUpDate(row, row.followUpAt, snapshots);
    followUpDevices.push({ device: row, woken: wakeUpDate !== null });
  }

  const followUpCount = followUpDevices.length;
  const wakeUpCount = followUpDevices.filter((d) => d.woken).length;
  const stillDormantCount = followUpCount - wakeUpCount;

  const mapDevice = (
    d: (typeof expanded)[0] | (typeof followed)[0],
    extra?: { woken?: boolean }
  ) =>
    ({
      deviceSn: d.deviceSn,
      merchantName: d.merchantName ?? d.activationMerchantName,
      firstTxnDate: isoDate(d.firstTxnDate),
      qualificationStatus: d.qualificationStatus,
      followUpAt: isoDate(d.followUpAt),
      woken: extra?.woken ?? false,
    }) satisfies XlvStaffMonthlyDeviceRow;

  const nameSource = expanded[0] ?? followed[0] ?? nameRow;
  const staffName =
    nameSource?.operatorName?.trim() ||
    (opts.staffKey.startsWith("name:")
      ? opts.staffKey.slice(5)
      : "未分配");
  const managerName = nameSource?.managerName?.trim() || "—";

  return {
    dateFrom,
    dateTo,
    manager: { key: opts.managerKey, name: managerName },
    staff: { key: opts.staffKey, name: staffName },
    summary: {
      expandCount,
      qualifiedCount,
      inProgressCount,
      invalidCount,
      qualifyRate: ratePercent(qualifiedCount, deployedCount),
      followUpCount,
      wakeUpCount,
      stillDormantCount,
      wakeUpRate: ratePercent(wakeUpCount, followUpCount),
    } satisfies XlvStaffMonthlySummary,
    expandDevices: expanded.map((d) => mapDevice(d)),
    followUpDevices: followUpDevices.map(({ device, woken }) =>
      mapDevice(device, { woken })
    ),
  };
}
