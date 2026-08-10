import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import {
  classifyXlvAlert,
  isXlvInventoryManagerKey,
  isXlvUnassignedManager,
  type XlvQualificationStatus,
  xlvEffectiveAlertKind,
  xlvManagerDisplayName,
  xlvQualificationGapLine,
} from "@/lib/xlv-rules";
import {
  buildXlvQualificationDetail,
  loadXlvSnapshotMap,
  attachXlvQualificationDetails,
} from "@/services/xlv/assessment";
import { syncXlvQualificationStatus } from "@/services/xlv/recompute-qualification";
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
import { withXlvBoardCache } from "./board-cache";
import { withXlvHeavyGate } from "./xlv-heavy-gate";

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

const BOARD_DEVICE_SELECT = {
  deviceSn: true,
  managerUserId: true,
  managerName: true,
  salesUserId: true,
  operatorName: true,
  sleepDays: true,
  cumulativeTxns: true,
  cumulativeUsers: true,
  firstTxnDate: true,
  qualificationStatus: true,
} as const;

type BoardDeviceRow = {
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
};

const BOARD_BATCH_SIZE = 800;

function sortBoardRows(rows: XlvBoardRow[]) {
  return rows.sort((a, b) => {
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

function addDeviceToBoardMap(
  map: Map<string, XlvBoardRow>,
  d: BoardDeviceRow,
  keyFn: (d: BoardDeviceRow) => string,
  nameFn: (d: BoardDeviceRow) => string,
  userIdFn: (d: BoardDeviceRow) => string | null
) {
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
  const alert = xlvEffectiveAlertKind(d);
  if (alert === "dormant") row.dormantCount += 1;
  if (alert === "single_silence") row.singleSilenceCount += 1;
}

async function aggregateBoardDevices(
  where: Prisma.XlvDeviceRecordWhereInput,
  keyFn: (d: BoardDeviceRow) => string,
  nameFn: (d: BoardDeviceRow) => string,
  userIdFn: (d: BoardDeviceRow) => string | null
) {
  const map = new Map<string, XlvBoardRow>();
  let deviceCount = 0;
  let inventoryCount = 0;
  let qualifiedCount = 0;
  let inProgressCount = 0;
  let invalidCount = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await db.xlvDeviceRecord.findMany({
      where,
      select: BOARD_DEVICE_SELECT,
      take: BOARD_BATCH_SIZE,
      orderBy: { deviceSn: "asc" },
      ...(cursor ? { skip: 1, cursor: { deviceSn: cursor } } : {}),
    });
    if (batch.length === 0) break;

    for (const d of batch) {
      addDeviceToBoardMap(map, d, keyFn, nameFn, userIdFn);
      deviceCount += 1;
      if (isXlvUnassignedManager(d)) {
        inventoryCount += 1;
        continue;
      }
      if (d.qualificationStatus === "qualified") qualifiedCount += 1;
      else if (d.qualificationStatus === "in_progress") inProgressCount += 1;
      else if (d.qualificationStatus === "invalid") invalidCount += 1;
    }

    cursor = batch[batch.length - 1]!.deviceSn;
    if (batch.length < BOARD_BATCH_SIZE) break;
  }

  const deployedCount = deviceCount - inventoryCount;
  const qualifyRate =
    deployedCount > 0
      ? Math.round((qualifiedCount / deployedCount) * 1000) / 10
      : 0;

  return {
    rows: sortBoardRows([...map.values()]),
    summary: {
      deviceCount,
      deployedCount,
      inventoryCount,
      qualifiedCount,
      inProgressCount,
      invalidCount,
      qualifyRate,
    },
  };
}

export async function getXlvManagerBoard(user: SessionUser) {
  return withXlvBoardCache(`mgr:${user.id}:${user.role}`, () =>
    withXlvHeavyGate(async () => {
    const roleWhere = buildXlvRoleWhere(user);
    const { rows, summary } = await aggregateBoardDevices(
      roleWhere,
      (d) => xlvManagerKeyOf(d),
      (d) => xlvManagerDisplayName(d.managerName),
      (d) => d.managerUserId
    );

    const filteredRows = rows.filter((r) => !isXlvInventoryManagerKey(r.key));

    return {
      rows: filteredRows,
      summary: {
        managerCount: filteredRows.length,
        ...summary,
      },
    };
    })
  );
}

export async function getXlvStaffBoard(
  user: SessionUser,
  opts: { managerKey: string }
) {
  return withXlvBoardCache(
    `staff:${user.id}:${opts.managerKey}`,
    () =>
      withXlvHeavyGate(async () => {
      assertManagerOwnsXlvKey(user, opts.managerKey);
      const managerWhere = await buildXlvManagerDeviceWhere(opts.managerKey);
      const roleWhere = buildXlvRoleWhere(user);

      const { rows, summary } = await aggregateBoardDevices(
        { AND: [roleWhere, managerWhere] },
        (d) => xlvStaffKeyOf(d),
        (d) => d.operatorName || "未分配",
        (d) => d.salesUserId
      );

      const sample = await db.xlvDeviceRecord.findFirst({
        where: { AND: [roleWhere, managerWhere] },
        select: { managerName: true, managerUserId: true },
        orderBy: { updatedAt: "desc" },
      });

      const managerUser = opts.managerKey.startsWith("name:")
        ? null
        : await db.user.findUnique({
            where: { id: opts.managerKey },
            select: { id: true, name: true },
          });

      const managerName = isXlvInventoryManagerKey(opts.managerKey)
        ? xlvManagerDisplayName("")
        : sample?.managerName?.trim() ||
          managerUser?.name ||
          opts.managerKey.slice(5);

      return {
        manager: {
          key: opts.managerKey,
          name: managerName,
          userId: managerUser?.id ?? sample?.managerUserId ?? null,
        },
        rows,
        summary: {
          staffCount: rows.length,
          ...summary,
        },
      };
      })
  );
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

  let device = await db.xlvDeviceRecord.findUnique({
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
  if (device.qualificationStatus !== qualificationDetail.status) {
    await syncXlvQualificationStatus(deviceSn, qualificationDetail.status);
    device = { ...device, qualificationStatus: qualificationDetail.status };
  }
  const txnTrend = buildXlvTxnActivityTrend(snapshots, { skipEnrich: true }).map(
    (p) => ({
      ...p,
    })
  );

  return { device, qualificationDetail, txnTrend };
}
