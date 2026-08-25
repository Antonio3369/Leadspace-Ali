import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentMonthRange } from "@/lib/n7-date";
import type { SessionUser } from "@/lib/permissions";
import { detectXlvWakeUpDate } from "@/lib/xlv-wake-up";
import {
  isXlvDeviceCompliant,
  isXlvInventoryManagerKey,
  isXlvUnassignedManager,
  type XlvQualificationStatus,
  XLV_COMPLIANCE_TARGET_RATE,
  xlvEffectiveAlertKind,
  xlvManagerDisplayName,
  xlvStoredQualificationGap,
} from "@/lib/xlv-rules";
import {
  buildXlvQualificationDetail,
  loadXlvSnapshotMapAfterFollowUp,
} from "@/services/xlv/assessment";
import { syncXlvQualificationStatus } from "@/services/xlv/recompute-qualification";
import {
  assertCanViewXlvDevice,
  assertCanViewXlvStaffScope,
  assertManagerOwnsXlvKey,
  buildXlvManagerDeviceWhere,
  buildXlvOperationalDeviceWhere,
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
import { loadSalesStockForOperator } from "./inventory/service";
import {
  attachXlvRelocations,
  loadXlvRelocationsBySn,
} from "./relocation";

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
  pendingFollowUpCount: number;
  monthFollowUpCount: number;
  monthWakeUpCount: number;
  monthWakeUpRate: number;
  compliantCount: number;
  complianceRate: number;
  complianceGapCount: number;
  toleranceRemainingCount: number;
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
  followUpDone: true,
  followUpAt: true,
  lastTxnDate: true,
  statDate: true,
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
  followUpDone: boolean;
  followUpAt: Date | null;
  lastTxnDate: Date | null;
  statDate: Date | null;
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
      pendingFollowUpCount: 0,
      monthFollowUpCount: 0,
      monthWakeUpCount: 0,
      monthWakeUpRate: 0,
      compliantCount: 0,
      complianceRate: 0,
      complianceGapCount: 0,
      toleranceRemainingCount: 0,
    };
    map.set(key, row);
  }
  row.deviceCount += 1;
  if (isXlvDeviceCompliant(d)) {
    row.compliantCount += 1;
  }
  if (!isXlvUnassignedManager(d)) {
    if (d.qualificationStatus === "qualified") row.qualifiedCount += 1;
    if (d.qualificationStatus === "in_progress") row.inProgressCount += 1;
    if (d.qualificationStatus === "invalid") row.invalidCount += 1;
  }
  const alert = xlvEffectiveAlertKind(d);
  if (alert === "dormant") row.dormantCount += 1;
  if (alert === "single_silence") row.singleSilenceCount += 1;
  if (
    !d.followUpDone &&
    (alert === "dormant" || alert === "single_silence")
  ) {
    row.pendingFollowUpCount += 1;
  }
}

async function aggregateBoardDevices(
  where: Prisma.XlvDeviceRecordWhereInput,
  keyFn: (d: BoardDeviceRow) => string,
  nameFn: (d: BoardDeviceRow) => string,
  userIdFn: (d: BoardDeviceRow) => string | null,
  opts?: { includeFollowUpMetrics?: boolean }
) {
  const map = new Map<string, XlvBoardRow>();
  let deviceCount = 0;
  let inventoryCount = 0;
  let qualifiedCount = 0;
  let inProgressCount = 0;
  let invalidCount = 0;
  let compliantCount = 0;
  let cursor: string | undefined;
  const { from: monthFrom, to: monthTo } = getCurrentMonthRange();
  const monthFollowed: BoardDeviceRow[] = [];

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
      if (
        opts?.includeFollowUpMetrics &&
        d.followUpAt &&
        d.followUpAt >= monthFrom &&
        d.followUpAt <= monthTo
      ) {
        map.get(keyFn(d))!.monthFollowUpCount += 1;
        monthFollowed.push(d);
      }
      deviceCount += 1;
      if (isXlvUnassignedManager(d)) {
        inventoryCount += 1;
        continue;
      }
      if (isXlvDeviceCompliant(d)) compliantCount += 1;
      if (d.qualificationStatus === "qualified") qualifiedCount += 1;
      else if (d.qualificationStatus === "in_progress") inProgressCount += 1;
      else if (d.qualificationStatus === "invalid") invalidCount += 1;
    }

    cursor = batch[batch.length - 1]!.deviceSn;
    if (batch.length < BOARD_BATCH_SIZE) break;
  }

  if (opts?.includeFollowUpMetrics && monthFollowed.length > 0) {
    const snapshotMap = await loadXlvSnapshotMapAfterFollowUp(monthFollowed);
    for (const d of monthFollowed) {
      const wakeUpDate = detectXlvWakeUpDate(
        d,
        d.followUpAt!,
        snapshotMap.get(d.deviceSn) ?? []
      );
      if (wakeUpDate) {
        map.get(keyFn(d))!.monthWakeUpCount += 1;
      }
    }
  }

  for (const row of map.values()) {
    row.monthWakeUpRate =
      row.monthFollowUpCount > 0
        ? Math.round(
            (row.monthWakeUpCount / row.monthFollowUpCount) * 1000
          ) / 10
        : 0;
    const requiredCompliantCount = Math.ceil(
      row.deviceCount * (XLV_COMPLIANCE_TARGET_RATE / 100)
    );
    row.complianceRate =
      row.deviceCount > 0
        ? Math.round((row.compliantCount / row.deviceCount) * 1000) / 10
        : 0;
    row.complianceGapCount = Math.max(
      0,
      requiredCompliantCount - row.compliantCount
    );
    row.toleranceRemainingCount = Math.max(
      0,
      row.compliantCount - requiredCompliantCount
    );
  }

  const deployedCount = deviceCount - inventoryCount;
  const qualifyRate =
    deployedCount > 0
      ? Math.round((qualifiedCount / deployedCount) * 1000) / 10
      : 0;
  const requiredCompliantCount = Math.ceil(
    deployedCount * (XLV_COMPLIANCE_TARGET_RATE / 100)
  );
  const complianceRate =
    deployedCount > 0
      ? Math.round((compliantCount / deployedCount) * 1000) / 10
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
      compliantCount,
      complianceRate,
      complianceGapCount: Math.max(0, requiredCompliantCount - compliantCount),
      toleranceRemainingCount: Math.max(
        0,
        compliantCount - requiredCompliantCount
      ),
    },
  };
}

export async function getXlvManagerBoard(user: SessionUser) {
  return withXlvBoardCache(`mgr:${user.id}:${user.role}`, () =>
    withXlvHeavyGate(async () => {
    const roleWhere = buildXlvRoleWhere(user);
    const boardResult = await aggregateBoardDevices(
      roleWhere,
      (d) => xlvManagerKeyOf(d),
      (d) => xlvManagerDisplayName(d.managerName),
      (d) => d.managerUserId,
      { includeFollowUpMetrics: true }
    );
    const { rows, summary } = boardResult;

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

      const boardResult = await aggregateBoardDevices(
          { AND: [roleWhere, managerWhere, buildXlvOperationalDeviceWhere()] },
          (d) => xlvStaffKeyOf(d),
          (d) => d.operatorName || "未分配",
          (d) => d.salesUserId,
          { includeFollowUpMetrics: true }
      );

      const { rows, summary } = boardResult;

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

  const where = {
    AND: [roleWhere, managerWhere, staffWhere, buildXlvOperationalDeviceWhere()],
  };

  const devices = await db.xlvDeviceRecord.findMany({
    where,
    orderBy: { deviceSn: "asc" },
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
      qualificationStatus: true,
      followUpDone: true,
    },
  });

  const withStatus = sortXlvDevices(devices, "risk");

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

  const managerName =
    devices[0]?.managerName ??
    managerUser?.name ??
    (opts.managerKey.startsWith("name:") ? opts.managerKey.slice(5) : "—");
  const staffName =
    devices[0]?.operatorName ??
    staffUser?.name ??
    (opts.staffKey.startsWith("name:") ? opts.staffKey.slice(5) : "—");

  const undeployedStock = await loadSalesStockForOperator(
    managerName,
    staffName
  );

  const devicesOut = withStatus.map((d) => ({
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
    qualificationGap: xlvStoredQualificationGap(d),
    followUpDone: d.followUpDone,
    relocation: null as { fromStore: string; toStore: string } | null,
  }));
  await attachXlvRelocations(devicesOut);

  return {
    manager: {
      key: opts.managerKey,
      name: managerName,
    },
    staff: {
      key: opts.staffKey,
      name: staffName,
    },
    undeployedStock,
    devices: devicesOut,
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

  const relocation =
    (await loadXlvRelocationsBySn([deviceSn])).get(deviceSn) ?? null;

  return { device, qualificationDetail, txnTrend, relocation };
}

export type XlvManagerComplianceSnapshot = {
  complianceRate: number;
  compliantCount: number;
  deviceCount: number;
  complianceGapCount: number;
};

/** 按经理姓名汇总运营合规率（供库存补货决策，与团队看板口径一致） */
export async function loadXlvManagerComplianceByName(
  forManagerName?: string | null
): Promise<Map<string, XlvManagerComplianceSnapshot>> {
  const cacheKey = `compliance:${forManagerName?.trim() || "all"}`;
  return withXlvBoardCache(cacheKey, () =>
    withXlvHeavyGate(async () => {
      const scope = forManagerName?.trim();
      const where: Prisma.XlvDeviceRecordWhereInput = scope
        ? {
            AND: [{ managerName: scope }, buildXlvOperationalDeviceWhere()],
          }
        : {
            AND: [
              { managerName: { not: "" } },
              buildXlvOperationalDeviceWhere(),
            ],
          };

      const { rows } = await aggregateBoardDevices(
        where,
        (d) => xlvManagerKeyOf(d),
        (d) => xlvManagerDisplayName(d.managerName),
        (d) => d.managerUserId
      );

      const map = new Map<string, XlvManagerComplianceSnapshot>();
      for (const row of rows) {
        if (isXlvInventoryManagerKey(row.key)) continue;
        map.set(row.name, {
          complianceRate: row.complianceRate,
          compliantCount: row.compliantCount,
          deviceCount: row.deviceCount,
          complianceGapCount: row.complianceGapCount,
        });
      }
      return map;
    })
  );
}
