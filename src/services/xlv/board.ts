import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import {
  classifyXlvAlert,
  isXlvInventoryManagerKey,
  isXlvUnassignedManager,
  type XlvQualificationStatus,
  xlvManagerDisplayName,
  xlvQualificationGapLine,
} from "@/lib/xlv-rules";
import {
  attachXlvQualificationDetails,
  buildXlvQualificationDetail,
  loadXlvSnapshotMap,
} from "@/services/xlv/assessment";
import {
  assertCanViewXlvDevice,
  assertCanViewXlvStaffScope,
  assertManagerOwnsXlvKey,
  buildXlvManagerDeviceWhere,
  buildXlvRoleWhere,
  buildXlvStaffDeviceWhere,
  xlvManagerKeyOf,
  xlvStaffKeyOf,
} from "./xlv-scope";
import { sortXlvDevices } from "./sort-devices";
import { enrichXlvSnapshotDailyMetrics, buildXlvTxnActivityTrend } from "./snapshot-daily";
import { normalizeXlvStatDate } from "@/lib/xlv-stat-date";

function isoDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

export type XlvBoardRow = {
  key: string;
  name: string;
  userId: string | null;
  deviceCount: number;
  qualifiedCount: number;
  inProgressCount: number;
  invalidCount: number;
  dormantCount: number;
  singleSilenceCount: number;
};

function tallyDevices(
  devices: {
    deviceSn: string;
    managerUserId: string | null;
    managerName: string;
    salesUserId: string | null;
    operatorName: string;
    sleepDays: number;
    cumulativeTxns: number;
    cumulativeUsers: number;
    firstTxnDate: Date | null;
    qualificationStatus: XlvQualificationStatus;
  }[],
  keyFn: (d: (typeof devices)[0]) => string,
  nameFn: (d: (typeof devices)[0]) => string,
  userIdFn: (d: (typeof devices)[0]) => string | null
): XlvBoardRow[] {
  const map = new Map<string, XlvBoardRow>();

  for (const d of devices) {
    const key = keyFn(d);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name: nameFn(d),
        userId: userIdFn(d),
        deviceCount: 0,
        qualifiedCount: 0,
        inProgressCount: 0,
        invalidCount: 0,
        dormantCount: 0,
        singleSilenceCount: 0,
      };
      map.set(key, row);
    }
    row.deviceCount += 1;
    if (!isXlvUnassignedManager(d)) {
      if (d.qualificationStatus === "qualified") row.qualifiedCount += 1;
      if (d.qualificationStatus === "in_progress") row.inProgressCount += 1;
      if (d.qualificationStatus === "invalid") row.invalidCount += 1;
    }
    const alert = classifyXlvAlert(d);
    if (alert === "dormant") row.dormantCount += 1;
    if (alert === "single_silence") row.singleSilenceCount += 1;
  }

  return [...map.values()].sort((a, b) => {
    const aInv = isXlvInventoryManagerKey(a.key);
    const bInv = isXlvInventoryManagerKey(b.key);
    if (aInv !== bInv) return aInv ? 1 : -1;
    return (
      b.qualifiedCount - a.qualifiedCount ||
      b.singleSilenceCount - a.singleSilenceCount ||
      b.dormantCount - a.dormantCount ||
      b.deviceCount - a.deviceCount
    );
  });
}

async function enrichDevicesForBoard<
  T extends {
    deviceSn: string;
    sleepDays: number;
    cumulativeTxns: number;
    cumulativeUsers: number;
    firstTxnDate: Date | null;
  },
>(devices: T[]) {
  const snapshotMap = await loadXlvSnapshotMap(devices.map((d) => d.deviceSn));
  return attachXlvQualificationDetails(devices, snapshotMap);
}

function boardSummaryStats(
  devices: {
    managerUserId: string | null;
    managerName: string;
    qualificationStatus: XlvQualificationStatus;
  }[]
) {
  const inventoryCount = devices.filter((d) => isXlvUnassignedManager(d)).length;
  const deployedCount = devices.length - inventoryCount;
  const assigned = devices.filter((d) => !isXlvUnassignedManager(d));
  const qualifiedCount = assigned.filter(
    (d) => d.qualificationStatus === "qualified"
  ).length;
  const inProgressCount = assigned.filter(
    (d) => d.qualificationStatus === "in_progress"
  ).length;
  const invalidCount = assigned.filter(
    (d) => d.qualificationStatus === "invalid"
  ).length;
  const qualifyRate =
    deployedCount > 0
      ? Math.round((qualifiedCount / deployedCount) * 1000) / 10
      : 0;
  return {
    deviceCount: devices.length,
    deployedCount,
    inventoryCount,
    qualifiedCount,
    inProgressCount,
    invalidCount,
    qualifyRate,
  };
}

export async function getXlvManagerBoard(user: SessionUser) {
  const roleWhere = buildXlvRoleWhere(user);
  const devices = await db.xlvDeviceRecord.findMany({
    where: roleWhere,
    select: {
      deviceSn: true,
      managerUserId: true,
      managerName: true,
      salesUserId: true,
      operatorName: true,
      sleepDays: true,
      cumulativeTxns: true,
      cumulativeUsers: true,
      firstTxnDate: true,
    },
  });

  const enriched = await enrichDevicesForBoard(devices);
  const rows = tallyDevices(
    enriched,
    (d) => xlvManagerKeyOf(d),
    (d) => xlvManagerDisplayName(d.managerName),
    (d) => d.managerUserId
  ).filter((r) => !isXlvInventoryManagerKey(r.key));

  const stats = boardSummaryStats(enriched);

  return {
    rows,
    summary: {
      managerCount: rows.length,
      ...stats,
    },
  };
}

export async function getXlvStaffBoard(
  user: SessionUser,
  opts: { managerKey: string }
) {
  assertManagerOwnsXlvKey(user, opts.managerKey);
  const managerWhere = await buildXlvManagerDeviceWhere(opts.managerKey);
  const roleWhere = buildXlvRoleWhere(user);

  const devices = await db.xlvDeviceRecord.findMany({
    where: { AND: [roleWhere, managerWhere] },
    select: {
      deviceSn: true,
      managerUserId: true,
      managerName: true,
      salesUserId: true,
      operatorName: true,
      sleepDays: true,
      cumulativeTxns: true,
      cumulativeUsers: true,
      firstTxnDate: true,
    },
  });

  const enriched = await enrichDevicesForBoard(devices);
  const rows = tallyDevices(
    enriched,
    (d) => xlvStaffKeyOf(d),
    (d) => d.operatorName || "未分配",
    (d) => d.salesUserId
  );

  const managerUser = opts.managerKey.startsWith("name:")
    ? null
    : await db.user.findUnique({
        where: { id: opts.managerKey },
        select: { id: true, name: true },
      });

  const managerName = isXlvInventoryManagerKey(opts.managerKey)
    ? xlvManagerDisplayName("")
    : devices[0]?.managerName?.trim() ||
      managerUser?.name ||
      opts.managerKey.slice(5);

  const stats = boardSummaryStats(enriched);

  return {
    manager: {
      key: opts.managerKey,
      name: managerName,
      userId: managerUser?.id ?? devices[0]?.managerUserId ?? null,
    },
    rows,
    summary: {
      staffCount: rows.length,
      ...stats,
    },
  };
}

export async function getXlvStaffDevices(
  user: SessionUser,
  opts: {
    managerKey: string;
    staffKey: string;
  }
) {
  assertCanViewXlvStaffScope(user, opts.managerKey, opts.staffKey);
  const managerWhere = await buildXlvManagerDeviceWhere(opts.managerKey);
  const staffWhere = await buildXlvStaffDeviceWhere(opts.staffKey);
  const roleWhere = buildXlvRoleWhere(user);

  const where = { AND: [roleWhere, managerWhere, staffWhere] };

  const devices = await db.xlvDeviceRecord.findMany({
    where,
    orderBy: { deviceSn: "asc" },
  });

  const snapshotMap = await loadXlvSnapshotMap(devices.map((d) => d.deviceSn));
  const withStatus = sortXlvDevices(
    attachXlvQualificationDetails(devices, snapshotMap),
    "risk"
  );

  const managerUser = opts.managerKey.startsWith("name:")
    ? null
    : await db.user.findUnique({
        where: { id: opts.managerKey },
        select: { name: true },
      });
  const staffUser = opts.staffKey.startsWith("name:")
    ? null
    : await db.user.findUnique({
        where: { id: opts.staffKey },
        select: { name: true },
      });

  return {
    manager: {
      key: opts.managerKey,
      name: devices[0]?.managerName ?? managerUser?.name ?? "—",
    },
    staff: {
      key: opts.staffKey,
      name: devices[0]?.operatorName ?? staffUser?.name ?? "—",
    },
    devices: withStatus.map((d) => ({
      deviceSn: d.deviceSn,
      merchantName: d.merchantName,
      activationMerchantName: d.activationMerchantName,
      operatorName: d.operatorName,
      managerName: d.managerName,
      companyName: d.companyName,
      cumulativeUsers: d.cumulativeUsers,
      cumulativeTxns: d.cumulativeTxns,
      sleepDays: d.sleepDays,
      lastTxnDate: isoDate(d.lastTxnDate),
      firstTxnDate: isoDate(d.firstTxnDate),
      qualificationStatus: d.qualificationStatus,
      qualificationGap: {
        usersGap: d.qualificationDetail.usersGap,
        txnsGap: d.qualificationDetail.txnsGap,
        line: xlvQualificationGapLine(d.qualificationDetail),
      },
    })),
  };
}

export async function getXlvDeviceDetail(user: SessionUser, deviceSn: string) {
  await assertCanViewXlvDevice(user, deviceSn);

  const device = await db.xlvDeviceRecord.findUnique({
    where: { deviceSn },
  });
  if (!device) {
    throw new Error("设备不存在");
  }

  const rawSnapshots = (
    await db.xlvDeviceSnapshot.findMany({
      where: { deviceSn },
      orderBy: { statDate: "asc" },
    })
  ).map((snap) => ({
    ...snap,
    statDate: normalizeXlvStatDate(snap.statDate),
  }));

  const snapshots = enrichXlvSnapshotDailyMetrics(rawSnapshots);
  const qualificationDetail = buildXlvQualificationDetail(device, snapshots);
  const txnTrend = buildXlvTxnActivityTrend(snapshots, { skipEnrich: true }).map(
    (p) => ({
      ...p,
    })
  );

  return { device, qualificationDetail, txnTrend };
}
