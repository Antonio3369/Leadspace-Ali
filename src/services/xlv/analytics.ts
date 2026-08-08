import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import {
  classifyXlvAlert,
  type XlvAlertKind,
  type XlvDeviceAlertKind,
  XLV_INVENTORY_MANAGER_LABEL,
  XLV_SLEEP_THRESHOLD_DAYS,
  isXlvUnassignedManager,
  isXlvActiveInProgress,
  type XlvQualificationStatus,
  xlvQualificationGapLine,
  xlvManagerDisplayName,
} from "@/lib/xlv-rules";
import {
  assertCanViewXlv,
  buildXlvAssignedDeviceWhere,
  buildXlvDeviceWhere,
  buildXlvInventoryDeviceWhere,
  buildXlvRoleWhere,
} from "@/services/xlv/xlv-scope";
import {
  attachXlvQualificationDetails,
  loadXlvSnapshotMap,
  xlvQualificationOf,
} from "@/services/xlv/assessment";
import {
  resolveXlvDeviceSortMode,
  sortXlvDevices,
} from "@/services/xlv/sort-devices";

export interface XlvDashboardSummary {
  totalDevices: number;
  deployedCount: number;
  inventoryCount: number;
  singleSilence: number;
  dormant: number;
  active: number;
  qualifiedCount: number;
  inProgressCount: number;
  invalidCount: number;
  latestStatDate: string | null;
}

export interface XlvDeviceListItem {
  deviceSn: string;
  merchantName: string | null;
  activationMerchantName: string | null;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  sleepDays: number;
  lastTxnDate: string | null;
  firstTxnDate: string | null;
  alertKind: XlvDeviceAlertKind;
  qualificationStatus?: XlvQualificationStatus;
  qualificationGapLine?: string;
}

export interface XlvManagerStat {
  managerName: string;
  total: number;
  singleSilence: number;
  dormant: number;
}

function isoDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

type XlvListDeviceRow = {
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
};

type XlvAssignedQualRow = {
  deviceSn: string;
  firstTxnDate: Date | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  sleepDays: number;
};

const LIST_DEVICE_SELECT = {
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
} as const;

const ASSIGNED_QUAL_SELECT = {
  deviceSn: true,
  firstTxnDate: true,
  cumulativeUsers: true,
  cumulativeTxns: true,
  sleepDays: true,
} as const;

function buildXlvDeviceListItems(
  enriched: ReturnType<typeof attachXlvQualificationDetails<XlvListDeviceRow>>
): XlvDeviceListItem[] {
  return enriched.map((row) => ({
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
    alertKind: classifyXlvAlert(row),
    qualificationStatus: row.qualificationStatus,
    qualificationGapLine: xlvQualificationGapLine(row.qualificationDetail),
  }));
}

function summarizeAssignedQualification(
  assignedRows: XlvAssignedQualRow[],
  snapshotMap: Awaited<ReturnType<typeof loadXlvSnapshotMap>>
) {
  let qualifiedCount = 0;
  let inProgressCount = 0;
  let invalidCount = 0;
  let active = 0;
  for (const row of assignedRows) {
    const snapshots = snapshotMap.get(row.deviceSn) ?? [];
    const status = xlvQualificationOf(row, snapshots);
    if (status === "qualified") qualifiedCount += 1;
    else if (status === "in_progress") inProgressCount += 1;
    else if (status === "invalid") invalidCount += 1;
    if (isXlvActiveInProgress({ ...row, qualificationStatus: status })) {
      active += 1;
    }
  }
  return { qualifiedCount, inProgressCount, invalidCount, active };
}

/** 看板页：单次加载快照，避免 summary + list 并行双倍占用内存 */
export async function getXlvDashboardPageData(
  user: SessionUser,
  opts: {
    alert?: XlvAlertKind;
    managerName?: string | null;
    operatorName?: string | null;
    search?: string | null;
    qualificationStatus?: XlvQualificationStatus | null;
    limit?: number;
  }
): Promise<{
  summary: XlvDashboardSummary;
  list: { total: number; devices: XlvDeviceListItem[] };
}> {
  assertCanViewXlv(user);
  const baseWhere = buildXlvRoleWhere(user);
  const listWhere = buildXlvDeviceWhere(user, opts);

  const needsFullQual = !opts.alert || opts.alert === "all";

  const [
    totalDevices,
    inventoryCount,
    singleSilence,
    dormantAll,
    latest,
    listRows,
    assignedRows,
  ] = await Promise.all([
    db.xlvDeviceRecord.count({ where: baseWhere }),
    db.xlvDeviceRecord.count({
      where: { AND: [baseWhere, buildXlvInventoryDeviceWhere()] },
    }),
    db.xlvDeviceRecord.count({
      where: {
        AND: [
          baseWhere,
          buildXlvAssignedDeviceWhere(),
          {
            cumulativeTxns: 1,
            sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS },
          },
        ],
      },
    }),
    db.xlvDeviceRecord.count({
      where: {
        AND: [
          baseWhere,
          buildXlvAssignedDeviceWhere(),
          { sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS } },
        ],
      },
    }),
    db.xlvDeviceRecord.findFirst({
      where: baseWhere,
      orderBy: { statDate: "desc" },
      select: { statDate: true },
    }),
    db.xlvDeviceRecord.findMany({
      where: listWhere,
      orderBy: { deviceSn: "asc" },
      ...(opts.limit != null ? { take: opts.limit } : {}),
      select: LIST_DEVICE_SELECT,
    }),
    needsFullQual
      ? db.xlvDeviceRecord.findMany({
          where: { AND: [baseWhere, buildXlvAssignedDeviceWhere()] },
          select: ASSIGNED_QUAL_SELECT,
        })
      : Promise.resolve([]),
  ]);

  const dormant = Math.max(0, dormantAll - singleSilence);
  const snapshotSns = needsFullQual
    ? [
        ...new Set([
          ...listRows.map((r) => r.deviceSn),
          ...assignedRows.map((r) => r.deviceSn),
        ]),
      ]
    : listRows.map((r) => r.deviceSn);
  const snapshotMap = await loadXlvSnapshotMap(snapshotSns);
  const qualSummary = needsFullQual
    ? summarizeAssignedQualification(assignedRows, snapshotMap)
    : {
        qualifiedCount: 0,
        inProgressCount: 0,
        invalidCount: 0,
        active: 0,
      };

  const enriched = attachXlvQualificationDetails(listRows, snapshotMap);
  let filtered = enriched;
  if (opts.qualificationStatus) {
    filtered = enriched.filter(
      (d) => d.qualificationStatus === opts.qualificationStatus
    );
  } else if (opts.alert === "active") {
    filtered = enriched.filter((d) =>
      isXlvActiveInProgress({
        sleepDays: d.sleepDays,
        cumulativeTxns: d.cumulativeTxns,
        qualificationStatus: d.qualificationStatus,
      })
    );
  }

  const sortMode = resolveXlvDeviceSortMode({
    alert: opts.alert,
    qualificationStatus: opts.qualificationStatus,
    search: opts.search,
  });
  const sorted = sortXlvDevices(
    filtered,
    sortMode,
    opts.qualificationStatus
  );
  const postFiltered =
    Boolean(opts.qualificationStatus) || opts.alert === "active";

  return {
    summary: {
      totalDevices,
      deployedCount: totalDevices - inventoryCount,
      inventoryCount,
      singleSilence,
      dormant,
      ...qualSummary,
      latestStatDate: isoDate(latest?.statDate),
    },
    list: {
      total: postFiltered ? sorted.length : listRows.length,
      devices: buildXlvDeviceListItems(sorted),
    },
  };
}

export async function getXlvDashboardSummary(
  user: SessionUser
): Promise<XlvDashboardSummary> {
  assertCanViewXlv(user);
  const baseWhere = buildXlvRoleWhere(user);

  const [totalDevices, inventoryCount, singleSilence, dormantAll, latest] =
    await Promise.all([
      db.xlvDeviceRecord.count({ where: baseWhere }),
      db.xlvDeviceRecord.count({
        where: { AND: [baseWhere, buildXlvInventoryDeviceWhere()] },
      }),
      db.xlvDeviceRecord.count({
        where: {
          AND: [
            baseWhere,
            buildXlvAssignedDeviceWhere(),
            {
              cumulativeTxns: 1,
              sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS },
            },
          ],
        },
      }),
      db.xlvDeviceRecord.count({
        where: {
          AND: [
            baseWhere,
            buildXlvAssignedDeviceWhere(),
            { sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS } },
          ],
        },
      }),
      db.xlvDeviceRecord.findFirst({
        where: baseWhere,
        orderBy: { statDate: "desc" },
        select: { statDate: true },
      }),
    ]);

  const dormant = Math.max(0, dormantAll - singleSilence);

  const assignedRows = await db.xlvDeviceRecord.findMany({
    where: { AND: [baseWhere, buildXlvAssignedDeviceWhere()] },
    select: {
      deviceSn: true,
      firstTxnDate: true,
      cumulativeUsers: true,
      cumulativeTxns: true,
      sleepDays: true,
    },
  });
  const snapshotMap = await loadXlvSnapshotMap(assignedRows.map((d) => d.deviceSn));
  let qualifiedCount = 0;
  let inProgressCount = 0;
  let invalidCount = 0;
  let active = 0;
  for (const row of assignedRows) {
    const snapshots = snapshotMap.get(row.deviceSn) ?? [];
    const status = xlvQualificationOf(row, snapshots);
    if (status === "qualified") qualifiedCount += 1;
    else if (status === "in_progress") inProgressCount += 1;
    else if (status === "invalid") invalidCount += 1;
    if (isXlvActiveInProgress({ ...row, qualificationStatus: status })) {
      active += 1;
    }
  }

  return {
    totalDevices,
    deployedCount: totalDevices - inventoryCount,
    inventoryCount,
    singleSilence,
    dormant,
    active,
    qualifiedCount,
    inProgressCount,
    invalidCount,
    latestStatDate: isoDate(latest?.statDate),
  };
}

export async function getXlvDeviceList(
  user: SessionUser,
  opts: {
    alert?: XlvAlertKind;
    managerName?: string | null;
    operatorName?: string | null;
    search?: string | null;
    qualificationStatus?: XlvQualificationStatus | null;
    limit?: number;
  }
): Promise<{ total: number; devices: XlvDeviceListItem[] }> {
  const where = buildXlvDeviceWhere(user, opts);
  const rows = await db.xlvDeviceRecord.findMany({
    where,
    orderBy: { deviceSn: "asc" },
    ...(opts.limit != null ? { take: opts.limit } : {}),
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
    },
  });

  const snapshotMap = await loadXlvSnapshotMap(rows.map((r) => r.deviceSn));
  const enriched = attachXlvQualificationDetails(rows, snapshotMap);
  let filtered = enriched;
  if (opts.qualificationStatus) {
    filtered = enriched.filter(
      (d) => d.qualificationStatus === opts.qualificationStatus
    );
  } else if (opts.alert === "active") {
    filtered = enriched.filter((d) =>
      isXlvActiveInProgress({
        sleepDays: d.sleepDays,
        cumulativeTxns: d.cumulativeTxns,
        qualificationStatus: d.qualificationStatus,
      })
    );
  }

  const sortMode = resolveXlvDeviceSortMode({
    alert: opts.alert,
    qualificationStatus: opts.qualificationStatus,
    search: opts.search,
  });
  const sorted = sortXlvDevices(
    filtered,
    sortMode,
    opts.qualificationStatus
  );

  const postFiltered =
    Boolean(opts.qualificationStatus) || opts.alert === "active";

  return {
    total: postFiltered ? sorted.length : rows.length,
    devices: buildXlvDeviceListItems(sorted),
  };
}

export async function getXlvManagerStats(
  user: SessionUser
): Promise<XlvManagerStat[]> {
  assertCanViewXlv(user);
  if (user.role === "SALES") return [];

  const where = buildXlvRoleWhere(user);
  const rows = await db.xlvDeviceRecord.findMany({
    where,
    select: {
      managerName: true,
      sleepDays: true,
      cumulativeTxns: true,
    },
  });

  const map = new Map<string, XlvManagerStat>();
  for (const row of rows) {
    const key = xlvManagerDisplayName(row.managerName);
    const stat = map.get(key) ?? {
      managerName: key,
      total: 0,
      singleSilence: 0,
      dormant: 0,
    };
    stat.total++;
    const kind = classifyXlvAlert(row);
    if (kind === "single_silence") stat.singleSilence++;
    else if (kind === "dormant") stat.dormant++;
    map.set(key, stat);
  }

  return [...map.values()].sort(
    (a, b) => b.singleSilence + b.dormant - (a.singleSilence + a.dormant)
  );
}

export async function getXlvFilterOptions(
  user: SessionUser,
  opts?: { managerName?: string | null }
) {
  assertCanViewXlv(user);
  const where = buildXlvRoleWhere(user);
  const rows = await db.xlvDeviceRecord.findMany({
    where,
    select: { managerName: true, operatorName: true, managerUserId: true },
  });
  const managers = [
    ...new Set(
      rows.map((r) =>
        isXlvUnassignedManager(r) ? XLV_INVENTORY_MANAGER_LABEL : r.managerName
      )
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => {
      if (a === XLV_INVENTORY_MANAGER_LABEL) return 1;
      if (b === XLV_INVENTORY_MANAGER_LABEL) return -1;
      return a.localeCompare(b, "zh-CN");
    });

  const managerFilter = opts?.managerName?.trim();
  const scopedRows = managerFilter
    ? rows.filter((r) => r.managerName === managerFilter)
    : rows;
  const operators = [
    ...new Set(scopedRows.map((r) => r.operatorName).filter(Boolean)),
  ].sort();

  return { managers, operators };
}
