import { db } from "@/lib/db";
import { parseN7DateRange } from "@/lib/n7-date";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import type { XlvQualificationStatus } from "@/lib/xlv-rules";
import { detectXlvWakeUpDate } from "@/lib/xlv-wake-up";
import { attachXlvQualificationDetails, loadXlvSnapshotMap } from "@/services/xlv/assessment";
import {
  assertCanViewXlv,
  assertManagerOwnsXlvKey,
  buildXlvAssignedDeviceWhere,
  buildXlvManagerDeviceWhere,
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
  return d ? d.toISOString().slice(0, 10) : null;
}

function dateInRange(d: Date | null | undefined, from: Date, to: Date) {
  if (!d) return false;
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
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

  const { from, to, dateFrom, dateTo } = parseN7DateRange(opts);
  if (!from || !to) {
    throw new Error("请选择有效日期范围");
  }

  const managerWhere = await buildXlvManagerDeviceWhere(opts.managerKey);
  const staffWhere = await buildXlvStaffDeviceWhere(opts.staffKey);
  const roleWhere = buildXlvRoleWhere(user);

  const devices = await db.xlvDeviceRecord.findMany({
    where: {
      AND: [roleWhere, buildXlvAssignedDeviceWhere(), managerWhere, staffWhere],
    },
    orderBy: { deviceSn: "asc" },
    select: {
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
    },
  });

  const snapshotMap = await loadXlvSnapshotMap(devices.map((d) => d.deviceSn));
  const enriched = attachXlvQualificationDetails(devices, snapshotMap);

  const expanded = enriched.filter((d) => dateInRange(d.firstTxnDate, from, to));
  const expandCount = expanded.length;
  const qualifiedCount = expanded.filter(
    (d) => d.qualificationStatus === "qualified"
  ).length;
  const inProgressCount = expanded.filter(
    (d) => d.qualificationStatus === "in_progress"
  ).length;
  const invalidCount = expanded.filter(
    (d) => d.qualificationStatus === "invalid"
  ).length;

  const followUpDevices: Array<{
    device: (typeof enriched)[0];
    woken: boolean;
  }> = [];

  for (const row of enriched) {
    if (!row.followUpDone || !row.followUpAt) continue;
    if (!dateInRange(row.followUpAt, from, to)) continue;
    const snapshots = snapshotMap.get(row.deviceSn) ?? [];
    const wakeUpDate = detectXlvWakeUpDate(row, row.followUpAt, snapshots);
    followUpDevices.push({ device: row, woken: wakeUpDate !== null });
  }

  const followUpCount = followUpDevices.length;
  const wakeUpCount = followUpDevices.filter((d) => d.woken).length;
  const stillDormantCount = followUpCount - wakeUpCount;

  const mapDevice = (d: (typeof enriched)[0], extra?: { woken?: boolean }) =>
    ({
      deviceSn: d.deviceSn,
      merchantName: d.merchantName ?? d.activationMerchantName,
      firstTxnDate: isoDate(d.firstTxnDate),
      qualificationStatus: d.qualificationStatus,
      followUpAt: isoDate(d.followUpAt),
      woken: extra?.woken ?? false,
    }) satisfies XlvStaffMonthlyDeviceRow;

  const staffName =
    devices[0]?.operatorName?.trim() ||
    (opts.staffKey.startsWith("name:")
      ? opts.staffKey.slice(5)
      : "未分配");
  const managerName = devices[0]?.managerName?.trim() || "—";

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
      qualifyRate: ratePercent(qualifiedCount, expandCount),
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
