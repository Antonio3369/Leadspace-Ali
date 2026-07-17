import type { N7DeviceRecord, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseN7DateRange } from "@/lib/n7-date";
import {
  daysGap,
  isFollowUpCandidate,
  priorityRank,
  ratePercent,
  resolveN7FailReason,
  resolveN7Priority,
  usersGap,
  type N7FailReason,
  type N7Priority,
} from "@/lib/n7-rules";

type N7RangeOpts = {
  dateFrom?: string | null;
  dateTo?: string | null;
  yearMonth?: string | null;
};

export type N7LeaderboardSortKey =
  | "expandCount"
  | "qualifiedCount"
  | "qualifyRate"
  | "followUpCount"
  | "p0Count";

export interface N7LeaderboardRow {
  key: string;
  name: string;
  userId: string | null;
  expandCount: number;
  qualifiedCount: number;
  qualifyRate: number;
  followUpCount: number;
  p0Count: number;
  notSubscribedCount: number;
  notCheckedInCount: number;
  notLitCount: number;
}

export interface N7DeviceListItem {
  id: string;
  deviceSn: string;
  storeName: string | null;
  storeId: string | null;
  merchantPhone: string | null;
  storePhone: string | null;
  storeAddress: string | null;
  operatorName: string;
  managerName: string;
  salesUserId: string | null;
  managerUserId: string | null;
  registeredAt: string | null;
  litAt: string | null;
  subscribedAt: string | null;
  firstCheckInAt: string | null;
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
  assessmentStartAt: string | null;
  assessmentEndAt: string | null;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
  effectiveUsers: number;
  isQualified: boolean;
  priority: N7Priority | null;
  failReason: N7FailReason | null;
  daysGap: number;
  usersGap: number;
}

export interface N7DailyPoint {
  date: string;
  /** 当日注册开单数 */
  expandCount: number;
  /** 当日注册中，当前实际已达标数 */
  qualifiedCount: number;
}

function registeredWhere(
  from: Date | null,
  to: Date | null
): Prisma.N7DeviceRecordWhereInput {
  if (!from && !to) return {};
  return {
    registeredAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

function resolveRange(opts: N7RangeOpts) {
  return parseN7DateRange({
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    month: opts.yearMonth,
  });
}

/** 经理范围：优先 managerUserId；仅未绑定 id 的历史行才用姓名兜底（避免重名串数） */
async function buildManagerDeviceWhere(
  managerKey: string
): Promise<Prisma.N7DeviceRecordWhereInput> {
  if (managerKey.startsWith("name:")) {
    return { managerName: managerKey.slice(5) };
  }
  const user = await db.user.findUnique({
    where: { id: managerKey },
    select: { name: true },
  });
  if (!user) return { managerUserId: managerKey };
  return {
    OR: [
      { managerUserId: managerKey },
      { AND: [{ managerUserId: null }, { managerName: user.name }] },
    ],
  };
}

function summarizeDevices(devices: N7DeviceRecord[]): Omit<
  N7LeaderboardRow,
  "key" | "name" | "userId"
> {
  let qualifiedCount = 0;
  let followUpCount = 0;
  let p0Count = 0;
  let notSubscribedCount = 0;
  let notCheckedInCount = 0;
  let notLitCount = 0;

  for (const d of devices) {
    if (d.isQualified) qualifiedCount += 1;

    const priority = resolveN7Priority(d);
    if (priority) {
      followUpCount += 1;
      if (priority === "P0") p0Count += 1;
      // 行为列只统计「待跟进」范围内，避免已达标/已结束仍带未订阅标记造成误导
      if (d.notSubscribed) notSubscribedCount += 1;
      if (d.notCheckedIn) notCheckedInCount += 1;
      if (d.notLit) notLitCount += 1;
    }
  }

  const expandCount = devices.length;
  return {
    expandCount,
    qualifiedCount,
    qualifyRate: ratePercent(qualifiedCount, expandCount),
    followUpCount,
    p0Count,
    notSubscribedCount,
    notCheckedInCount,
    notLitCount,
  };
}

function sortLeaderboard(
  rows: N7LeaderboardRow[],
  sortKey: N7LeaderboardSortKey,
  order: "asc" | "desc"
): N7LeaderboardRow[] {
  const dir = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av !== bv) return (av < bv ? -1 : 1) * dir;
    return b.expandCount - a.expandCount;
  });
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function mapDevice(d: N7DeviceRecord): N7DeviceListItem {
  const priority = resolveN7Priority(d);
  return {
    id: d.id,
    deviceSn: d.deviceSn,
    storeName: d.storeName,
    storeId: d.storeId,
    merchantPhone: d.merchantPhone,
    storePhone: d.storePhone,
    storeAddress: d.storeAddress,
    operatorName: d.operatorName,
    managerName: d.managerName,
    salesUserId: d.salesUserId,
    managerUserId: d.managerUserId,
    registeredAt: toIso(d.registeredAt),
    litAt: toIso(d.litAt),
    subscribedAt: toIso(d.subscribedAt),
    firstCheckInAt: toIso(d.firstCheckInAt),
    notLit: d.notLit,
    notSubscribed: d.notSubscribed,
    notCheckedIn: d.notCheckedIn,
    assessmentStartAt: toIso(d.assessmentStartAt),
    assessmentEndAt: toIso(d.assessmentEndAt),
    remainingDays: d.remainingDays,
    remainingEnded: d.remainingEnded,
    effectiveDays: d.effectiveDays,
    effectiveUsers: d.effectiveUsers,
    isQualified: d.isQualified,
    priority,
    failReason: d.isQualified
      ? null
      : resolveN7FailReason(d.effectiveDays, d.effectiveUsers),
    daysGap: daysGap(d.effectiveDays),
    usersGap: usersGap(d.effectiveUsers),
  };
}

function sortFollowUp(items: N7DeviceListItem[]): N7DeviceListItem[] {
  return [...items].sort((a, b) => {
    const ap = a.priority ? priorityRank(a.priority) : 99;
    const bp = b.priority ? priorityRank(b.priority) : 99;
    if (ap !== bp) return ap - bp;
    const ar = a.remainingDays ?? 99;
    const br = b.remainingDays ?? 99;
    if (ar !== br) return ar - br;
    return a.effectiveDays + a.effectiveUsers - (b.effectiveDays + b.effectiveUsers);
  });
}

/** 管理员：经理排行榜 */
export async function getN7ManagerLeaderboard(
  opts: N7RangeOpts & {
    sortKey?: N7LeaderboardSortKey;
    order?: "asc" | "desc";
    search?: string | null;
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const devices = await db.n7DeviceRecord.findMany({
    where: registeredWhere(from, to),
  });

  const groups = new Map<string, N7DeviceRecord[]>();
  for (const d of devices) {
    const key = d.managerUserId ?? `name:${d.managerName}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  let rows: N7LeaderboardRow[] = [...groups.entries()].map(([key, list]) => {
    const sample = list[0]!;
    return {
      key,
      name: sample.managerName,
      userId: sample.managerUserId,
      ...summarizeDevices(list),
    };
  });

  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  }

  rows = sortLeaderboard(
    rows,
    opts.sortKey ?? "expandCount",
    opts.order ?? "desc"
  );

  const totals = summarizeDevices(devices);

  return {
    dateFrom,
    dateTo,
    totals: {
      managerCount: rows.length,
      ...totals,
    },
    rows: rows.map((r, i) => ({ ...r, rank: i + 1 })),
  };
}

/** 某经理下的队员排行 */
export async function getN7StaffLeaderboard(
  opts: N7RangeOpts & {
    managerKey: string;
    sortKey?: N7LeaderboardSortKey;
    order?: "asc" | "desc";
    search?: string | null;
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const managerWhere = await buildManagerDeviceWhere(opts.managerKey);

  const devices = await db.n7DeviceRecord.findMany({
    where: { AND: [registeredWhere(from, to), managerWhere] },
  });

  const managerUser = opts.managerKey.startsWith("name:")
    ? null
    : await db.user.findUnique({
        where: { id: opts.managerKey },
        select: { id: true, name: true },
      });
  const managerName =
    devices[0]?.managerName ?? managerUser?.name ?? opts.managerKey;
  const managerUserId = devices[0]?.managerUserId ?? managerUser?.id ?? null;

  const groups = new Map<string, N7DeviceRecord[]>();
  for (const d of devices) {
    const key = d.salesUserId ?? `name:${d.operatorName}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  let rows: N7LeaderboardRow[] = [...groups.entries()].map(([key, list]) => {
    const sample = list[0]!;
    return {
      key,
      name: sample.operatorName,
      userId: sample.salesUserId,
      ...summarizeDevices(list),
    };
  });

  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  }

  rows = sortLeaderboard(
    rows,
    opts.sortKey ?? "expandCount",
    opts.order ?? "desc"
  );

  return {
    dateFrom,
    dateTo,
    manager: { key: opts.managerKey, name: managerName, userId: managerUserId },
    totals: summarizeDevices(devices),
    rows: rows.map((r, i) => ({ ...r, rank: i + 1 })),
  };
}

/** 某队员（或经理名下某人）的设备列表 */
export async function getN7StaffDevices(
  opts: N7RangeOpts & {
    staffKey: string;
    managerKey?: string | null;
    tab?: "followUp" | "qualified" | "all";
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const staffWhere: Prisma.N7DeviceRecordWhereInput = opts.staffKey.startsWith(
    "name:"
  )
    ? { operatorName: opts.staffKey.slice(5) }
    : { salesUserId: opts.staffKey };

  const parts: Prisma.N7DeviceRecordWhereInput[] = [
    registeredWhere(from, to),
    staffWhere,
  ];

  if (opts.managerKey) {
    parts.push(await buildManagerDeviceWhere(opts.managerKey));
  }

  const devices = await db.n7DeviceRecord.findMany({
    where: { AND: parts },
    orderBy: { registeredAt: "desc" },
  });

  const mapped = devices.map(mapDevice);
  const tab = opts.tab ?? "followUp";
  let list = mapped;
  if (tab === "followUp") {
    list = sortFollowUp(mapped.filter((d) => d.priority != null));
  } else if (tab === "qualified") {
    list = mapped.filter((d) => d.isQualified);
  }

  const sample = devices[0];
  return {
    dateFrom,
    dateTo,
    staff: {
      key: opts.staffKey,
      name: sample?.operatorName ?? opts.staffKey,
      userId: sample?.salesUserId ?? null,
      managerName: sample?.managerName ?? null,
    },
    totals: summarizeDevices(devices),
    priorityCounts: {
      P0: mapped.filter((d) => d.priority === "P0").length,
      P1: mapped.filter((d) => d.priority === "P1").length,
      P2: mapped.filter((d) => d.priority === "P2").length,
      P3: mapped.filter((d) => d.priority === "P3").length,
      followUp: mapped.filter((d) => d.priority != null).length,
    },
    devices: list,
  };
}

/** 待跟进 / P0 设备明细（可按经理范围过滤） */
export async function getN7FollowUpDevices(
  opts: N7RangeOpts & {
    priority?: N7Priority | "all" | null;
    managerKey?: string | null;
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const parts: Prisma.N7DeviceRecordWhereInput[] = [registeredWhere(from, to)];

  if (opts.managerKey) {
    parts.push(await buildManagerDeviceWhere(opts.managerKey));
  }

  const devices = await db.n7DeviceRecord.findMany({
    where: { AND: parts },
    orderBy: { registeredAt: "desc" },
  });

  const mapped = devices.map(mapDevice);
  const followUp = sortFollowUp(mapped.filter((d) => d.priority != null));
  const priority = opts.priority && opts.priority !== "all" ? opts.priority : null;
  const list = priority
    ? followUp.filter((d) => d.priority === priority)
    : followUp;

  let managerName: string | null = null;
  if (opts.managerKey) {
    if (opts.managerKey.startsWith("name:")) {
      managerName = opts.managerKey.slice(5);
    } else {
      const u = await db.user.findUnique({
        where: { id: opts.managerKey },
        select: { name: true },
      });
      managerName = devices[0]?.managerName ?? u?.name ?? opts.managerKey;
    }
  }

  return {
    dateFrom,
    dateTo,
    filter: priority ?? "all",
    manager: opts.managerKey
      ? { key: opts.managerKey, name: managerName ?? opts.managerKey }
      : null,
    totals: summarizeDevices(devices),
    counts: {
      followUp: followUp.length,
      P0: followUp.filter((d) => d.priority === "P0").length,
      P1: followUp.filter((d) => d.priority === "P1").length,
      P2: followUp.filter((d) => d.priority === "P2").length,
      P3: followUp.filter((d) => d.priority === "P3").length,
    },
    devices: list,
  };
}

export async function getN7DeviceDetail(deviceSn: string) {
  const device = await db.n7DeviceRecord.findUnique({ where: { deviceSn } });
  if (!device) return null;

  const siblings =
    device.storeId != null
      ? await db.n7DeviceRecord.count({ where: { storeId: device.storeId } })
      : 1;

  return {
    ...mapDevice(device),
    storeDeviceCount: siblings,
    companyName: device.companyName,
    merchantId: device.merchantId,
    merchantAccount: device.merchantAccount,
    phase2Days: device.phase2Days,
    phase2Users: device.phase2Users,
    inFollowUp: isFollowUpCandidate(device),
  };
}

/** 每日开单（按注册日） */
export async function getN7DailyPerformance(
  opts: N7RangeOpts & {
    managerKey?: string | null;
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const where: Prisma.N7DeviceRecordWhereInput = {
    AND: [
      registeredWhere(from, to),
      ...(opts.managerKey
        ? [await buildManagerDeviceWhere(opts.managerKey)]
        : []),
    ],
  };

  const devices = await db.n7DeviceRecord.findMany({
    where,
    select: {
      registeredAt: true,
      isQualified: true,
    },
  });

  const emptyPoint = (date: string): N7DailyPoint => ({
    date,
    expandCount: 0,
    qualifiedCount: 0,
  });

  const byDay = new Map<string, N7DailyPoint>();
  if (from && to) {
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      byDay.set(key, emptyPoint(key));
    }
  }

  // 按注册日：开单 + 其中实际已达标（同一批设备的双指标）
  for (const device of devices) {
    if (!device.registeredAt) continue;
    const key = formatLocalDate(device.registeredAt);
    const point = byDay.get(key) ?? emptyPoint(key);
    point.expandCount += 1;
    if (device.isQualified) point.qualifiedCount += 1;
    byDay.set(key, point);
  }

  const points = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    dateFrom,
    dateTo,
    points,
  };
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
