import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import {
  classifyXlvAlert,
  type XlvAlertKind,
  type XlvDeviceAlertKind,
  XLV_INVENTORY_MANAGER_LABEL,
  XLV_SLEEP_THRESHOLD_DAYS,
  isXlvUnassignedManager,
  type XlvQualificationStatus,
  xlvEffectiveAlertKind,
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
} from "@/services/xlv/assessment";
import { syncXlvQualificationStatuses } from "@/services/xlv/recompute-qualification";
import { countXlvQualificationSummary } from "@/services/xlv/recompute-qualification";
import {
  resolveXlvDeviceSortMode,
  sortXlvDevices,
  xlvDeviceListSqlOrderBy,
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

export const XLV_DASHBOARD_PAGE_SIZE = 20;

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
  qualificationStatus: true,
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
    alertKind: xlvEffectiveAlertKind(row),
    qualificationStatus: row.qualificationStatus as XlvQualificationStatus,
    qualificationGapLine: xlvQualificationGapLine(row.qualificationDetail),
  }));
}

/** @deprecated 请用 getXlvDashboardSummary + getXlvDashboardDevicesPage */
export async function getXlvDashboardPageData(
  user: SessionUser,
  opts: XlvDashboardListOpts & { limit?: number }
): Promise<{
  summary: XlvDashboardSummary;
  list: { total: number; devices: XlvDeviceListItem[] };
}> {
  const [summary, list] = await Promise.all([
    getXlvDashboardSummary(user),
    getXlvDashboardDevicesPage(user, {
      ...opts,
      offset: 0,
      limit: opts.limit ?? XLV_DASHBOARD_PAGE_SIZE,
    }),
  ]);
  return {
    summary,
    list: { total: list.total, devices: list.devices },
  };
}

export async function getXlvDashboardSummary(
  user: SessionUser
): Promise<XlvDashboardSummary> {
  const fast = await getXlvDashboardSummaryFast(user);
  const qual = await getXlvDashboardQualSummary(user);
  return { ...fast, ...qual };
}

/** 顶部卡片：沉睡/单笔等用 SQL 计数，毫秒级 */
export async function getXlvDashboardSummaryFast(
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
            { NOT: { cumulativeTxns: 1 } },
            { NOT: { qualificationStatus: "qualified" } },
          ],
        },
      }),
      db.xlvDeviceRecord.findFirst({
        where: baseWhere,
        orderBy: { statDate: "desc" },
        select: { statDate: true },
      }),
    ]);

  const dormant = dormantAll;

  return {
    totalDevices,
    deployedCount: totalDevices - inventoryCount,
    inventoryCount,
    singleSilence,
    dormant,
    active: 0,
    qualifiedCount: 0,
    inProgressCount: 0,
    invalidCount: 0,
    latestStatDate: isoDate(latest?.statDate),
  };
}

/** 达标/无效/活跃：需快照，单独延迟加载 */
export async function getXlvDashboardQualSummary(
  user: SessionUser
): Promise<
  Pick<
    XlvDashboardSummary,
    "active" | "qualifiedCount" | "inProgressCount" | "invalidCount"
  >
> {
  return countXlvQualificationSummary(user);
}

type XlvDashboardListOpts = {
  alert?: XlvAlertKind;
  managerName?: string | null;
  operatorName?: string | null;
  search?: string | null;
  qualificationStatus?: XlvQualificationStatus | null;
};

/** 看板设备列表（分页）：默认先 enrich 当前页，减轻首屏内存 */
export async function getXlvDashboardDevicesPage(
  user: SessionUser,
  opts: XlvDashboardListOpts & {
    offset?: number;
    limit?: number;
  }
): Promise<{
  total: number;
  devices: XlvDeviceListItem[];
  hasMore: boolean;
}> {
  assertCanViewXlv(user);
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = opts.limit ?? XLV_DASHBOARD_PAGE_SIZE;
  const listWhere = buildXlvDeviceWhere(user, {
    alert: opts.alert,
    managerName: opts.managerName,
    operatorName: opts.operatorName,
    search: opts.search,
    qualificationStatus: opts.qualificationStatus,
  });

  const sortMode = resolveXlvDeviceSortMode({
    alert: opts.alert,
    qualificationStatus: opts.qualificationStatus,
    search: opts.search,
  });

  const [total, pageRows] = await Promise.all([
    db.xlvDeviceRecord.count({ where: listWhere }),
    db.xlvDeviceRecord.findMany({
      where: listWhere,
      orderBy: xlvDeviceListSqlOrderBy(sortMode),
      skip: offset,
      take: limit,
      select: LIST_DEVICE_SELECT,
    }),
  ]);
  const snapshotMap = await loadXlvSnapshotMap(pageRows.map((r) => r.deviceSn));
  const enriched = attachXlvQualificationDetails(pageRows, snapshotMap);

  const heals = pageRows.flatMap((row) => {
    const computed = enriched.find((e) => e.deviceSn === row.deviceSn);
    if (!computed || row.qualificationStatus === computed.qualificationStatus) {
      return [];
    }
    return [{ deviceSn: row.deviceSn, status: computed.qualificationStatus }];
  });
  if (heals.length > 0) {
    void syncXlvQualificationStatuses(heals).catch(() => undefined);
  }

  let devices = buildXlvDeviceListItems(enriched);
  if (opts.qualificationStatus) {
    devices = devices.filter(
      (d) => d.qualificationStatus === opts.qualificationStatus
    );
  }

  return {
    total,
    devices,
    hasMore: offset + pageRows.length < total,
  };
}

export async function getXlvDeviceList(
  user: SessionUser,
  opts: XlvDashboardListOpts & { limit?: number }
): Promise<{ total: number; devices: XlvDeviceListItem[] }> {
  const page = await getXlvDashboardDevicesPage(user, {
    ...opts,
    offset: 0,
    limit: opts.limit,
  });
  return { total: page.total, devices: page.devices };
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
