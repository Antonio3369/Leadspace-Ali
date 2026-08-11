import type { N7DeviceRecord, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseN7DateRange } from "@/lib/n7-date";
import {
  buildN7DeviceTextSearchPrismaWhere,
  N7_DEVICE_SEARCH_LIMIT,
} from "@/lib/n7-search";
import {
  daysGap,
  isFollowUpCandidate,
  isN7TimeHopeless,
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
  /** 考核已结束且仍未达标（与待跟进互斥） */
  expiredUnqualifiedCount: number;
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
  /** 时间上已无法靠剩余考核期追上有效天达标线；仍展示，排序靠后 */
  hopeless: boolean;
  /** 处理状态（经理/管理员可在详情页代记；与考核「待跟进」名单独立） */
  followUpDone: boolean;
  followUpNote: string | null;
  followUpConnectStatus: string | null;
  followUpFlags: string[];
  followUpPhotoUrls: string[];
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

/** 待跟进运营名单：考核未结束（不按注册月截断） */
function activeAssessmentWhere(): Prisma.N7DeviceRecordWhereInput {
  return { remainingEnded: false };
}

/** 过期复盘名单：考核已结束且仍未达标 */
function expiredAssessmentWhere(): Prisma.N7DeviceRecordWhereInput {
  return { remainingEnded: true, isQualified: false };
}

async function buildN7ScopeWhereParts(opts: {
  managerKey?: string | null;
  staffKey?: string | null;
}): Promise<Prisma.N7DeviceRecordWhereInput[]> {
  const parts: Prisma.N7DeviceRecordWhereInput[] = [];
  if (opts.managerKey) {
    parts.push(await buildManagerDeviceWhere(opts.managerKey));
  }
  if (opts.staffKey) {
    parts.push(await buildStaffDeviceWhere(opts.staffKey));
  }
  return parts;
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

/** 队员范围：优先 salesUserId；并按「姓名+所属经理」兜底（对齐沙箱，避免错挂导致空数据） */
async function buildStaffDeviceWhere(
  staffKey: string
): Promise<Prisma.N7DeviceRecordWhereInput> {
  if (staffKey.startsWith("name:")) {
    return { operatorName: staffKey.slice(5) };
  }
  const user = await db.user.findUnique({
    where: { id: staffKey },
    select: { name: true, managerId: true },
  });
  if (!user) return { salesUserId: staffKey };

  const parts: Prisma.N7DeviceRecordWhereInput[] = [{ salesUserId: staffKey }];

  if (user.managerId) {
    const manager = await db.user.findUnique({
      where: { id: user.managerId },
      select: { name: true },
    });
    parts.push({
      AND: [
        { operatorName: user.name },
        {
          OR: [
            { managerUserId: user.managerId },
            ...(manager?.name ? [{ managerName: manager.name }] : []),
          ],
        },
      ],
    });
  } else {
    parts.push({
      AND: [{ salesUserId: null }, { operatorName: user.name }],
    });
  }

  return { OR: parts };
}

function summarizeDevices(devices: N7DeviceRecord[]): Omit<
  N7LeaderboardRow,
  "key" | "name" | "userId"
> {
  let qualifiedCount = 0;
  let followUpCount = 0;
  let p0Count = 0;
  let expiredUnqualifiedCount = 0;
  let notSubscribedCount = 0;
  let notCheckedInCount = 0;
  let notLitCount = 0;

  for (const d of devices) {
    if (d.isQualified) qualifiedCount += 1;
    else if (d.remainingEnded) expiredUnqualifiedCount += 1;

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
    expiredUnqualifiedCount,
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
  const dayGap = daysGap(d.effectiveDays);
  const userGap = usersGap(d.effectiveUsers);
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
    daysGap: dayGap,
    usersGap: userGap,
    hopeless: isN7TimeHopeless(d),
    followUpDone: d.followUpDone,
    followUpNote: d.followUpNote,
    followUpConnectStatus: d.followUpConnectStatus,
    followUpFlags: d.followUpFlags ?? [],
    followUpPhotoUrls: d.followUpPhotoUrls ?? [],
  };
}

function sortFollowUp(items: N7DeviceListItem[]): N7DeviceListItem[] {
  return [...items].sort((a, b) => {
    // 未处理优先，方便经理/管理员扫漏
    if (a.followUpDone !== b.followUpDone) return a.followUpDone ? 1 : -1;
    // 仍可追的在前，时间无望的在后（保留可见）
    if (a.hopeless !== b.hopeless) return a.hopeless ? 1 : -1;
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
    tab?: "followUp" | "qualified" | "all" | "expired";
    q?: string | null;
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const searchQ = opts.q?.trim() ?? "";
  const isSearch = searchQ.length > 0;
  const staffWhere = await buildStaffDeviceWhere(opts.staffKey);

  const parts: Prisma.N7DeviceRecordWhereInput[] = [staffWhere];

  if (isSearch) {
    parts.push(buildN7DeviceTextSearchPrismaWhere(searchQ));
  } else {
    // 看板下钻：拓展/待跟进/过期均按注册日期区间（与经理排行同口径）
    parts.push(registeredWhere(from, to));
  }

  if (opts.managerKey) {
    parts.push(await buildManagerDeviceWhere(opts.managerKey));
  }

  const devices = await db.n7DeviceRecord.findMany({
    where: { AND: parts },
    orderBy: { registeredAt: "desc" },
    ...(isSearch ? { take: N7_DEVICE_SEARCH_LIMIT } : {}),
  });

  const mapped = devices.map(mapDevice);
  const tab = opts.tab ?? "followUp";
  let list = mapped;
  if (!isSearch) {
    if (tab === "followUp") {
      list = sortFollowUp(mapped.filter((d) => d.priority != null));
    } else if (tab === "qualified") {
      list = mapped.filter((d) => d.isQualified);
    } else if (tab === "expired") {
      list = mapped.filter((d) => !d.isQualified && d.remainingEnded);
    }
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
    searchMode: isSearch,
  };
}

/** 待跟进 / 过期未达标设备明细（运营页：按考核期；看板统计走 leaderboard） */
export async function getN7FollowUpDevices(
  opts: N7RangeOpts & {
    priority?: N7Priority | "all" | null;
    /** expired：考核结束仍未达标（与待跟进名单互斥） */
    status?: "expired" | null;
    managerKey?: string | null;
    staffKey?: string | null;
    q?: string | null;
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const searchQ = opts.q?.trim() ?? "";
  const isSearch = searchQ.length > 0;
  const parts: Prisma.N7DeviceRecordWhereInput[] = [];

  if (isSearch) {
    parts.push(buildN7DeviceTextSearchPrismaWhere(searchQ));
  } else if (opts.status === "expired") {
    parts.push(expiredAssessmentWhere());
  } else {
    parts.push(activeAssessmentWhere());
  }

  if (opts.managerKey) {
    parts.push(await buildManagerDeviceWhere(opts.managerKey));
  }
  if (opts.staffKey) {
    parts.push(await buildStaffDeviceWhere(opts.staffKey));
  }

  const devices = await db.n7DeviceRecord.findMany({
    where: { AND: parts },
    orderBy: { registeredAt: "desc" },
    ...(isSearch ? { take: N7_DEVICE_SEARCH_LIMIT } : {}),
  });

  const mapped = devices.map(mapDevice);

  if (isSearch) {
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
      filter: "all" as const,
      status: "search" as const,
      searchMode: true,
      manager: opts.managerKey
        ? { key: opts.managerKey, name: managerName ?? opts.managerKey }
        : null,
      totals: summarizeDevices(devices),
      counts: {
        followUp: mapped.filter((d) => d.priority != null).length,
        P0: mapped.filter((d) => d.priority === "P0").length,
        P1: mapped.filter((d) => d.priority === "P1").length,
        P2: mapped.filter((d) => d.priority === "P2").length,
        P3: mapped.filter((d) => d.priority === "P3").length,
        expired: mapped.filter((d) => !d.isQualified && d.remainingEnded).length,
      },
      devices: mapped,
    };
  }

  const followUp = sortFollowUp(mapped.filter((d) => d.priority != null));
  const expired = mapped
    .filter((d) => !d.isQualified && d.remainingEnded)
    .sort(
      (a, b) =>
        a.effectiveDays + a.effectiveUsers - (b.effectiveDays + b.effectiveUsers)
    );

  const isExpired = opts.status === "expired";
  const priority = opts.priority && opts.priority !== "all" ? opts.priority : null;
  const list = isExpired
    ? expired
    : priority
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

  const totals = summarizeDevices(devices);
  const scopeParts = await buildN7ScopeWhereParts(opts);
  const expiredCount = isExpired
    ? expired.length
    : await db.n7DeviceRecord.count({
        where: { AND: [...scopeParts, expiredAssessmentWhere()] },
      });

  return {
    dateFrom,
    dateTo,
    filter: isExpired ? ("expired" as const) : (priority ?? "all"),
    status: isExpired ? ("expired" as const) : ("followUp" as const),
    manager: opts.managerKey
      ? { key: opts.managerKey, name: managerName ?? opts.managerKey }
      : null,
    totals,
    counts: {
      followUp: followUp.length,
      P0: followUp.filter((d) => d.priority === "P0").length,
      P1: followUp.filter((d) => d.priority === "P1").length,
      P2: followUp.filter((d) => d.priority === "P2").length,
      P3: followUp.filter((d) => d.priority === "P3").length,
      expired: expiredCount,
    },
    devices: list,
    searchMode: false,
  };
}

/** 今日待办各队列预览条数（完整列表走达标跟进） */
const N7_TODAY_LIST_CAP = 80;

/**
 * 今日待办队列（运营首页）
 * - 主列表：系统催办（P0 且未关单）
 * - 快捷卡：未处理 / 过期未达标 / 区间已达标（不与底栏「达标跟进」重复）
 */
export async function getN7TodayQueues(
  opts: N7RangeOpts & {
    managerKey?: string | null;
    staffKey?: string | null;
    q?: string | null;
  }
) {
  const searchQ = opts.q?.trim() ?? "";
  if (searchQ) {
    const follow = await getN7FollowUpDevices({
      ...opts,
      priority: "all",
      q: searchQ,
    });
    return {
      dateFrom: follow.dateFrom,
      dateTo: follow.dateTo,
      manager: follow.manager,
      searchMode: true,
      counts: {
        urgent: follow.devices.length,
        pending: follow.devices.filter((d) => !d.followUpDone).length,
        other: 0,
        qualified: follow.totals.qualifiedCount,
        followUp: follow.counts.followUp,
        expand: follow.totals.expandCount,
        expired: follow.counts.expired,
      },
      queues: {
        urgent: follow.devices,
        other: [],
      },
      listCap: N7_DEVICE_SEARCH_LIMIT,
    };
  }

  const follow = await getN7FollowUpDevices({
    ...opts,
    priority: "all",
  });
  const followUp = follow.devices;
  /** 系统催办池：P0 且未关单 */
  const urgent = followUp.filter((d) => d.priority === "P0" && !d.followUpDone);
  const pending = followUp.filter((d) => !d.followUpDone);
  const other = followUp.filter((d) => d.priority !== "P0");

  const scopeParts = await buildN7ScopeWhereParts(opts);
  const { from, to } = resolveRange(opts);
  const [qualifiedInRange, expiredInScope] = await Promise.all([
    db.n7DeviceRecord.count({
      where: {
        AND: [...scopeParts, registeredWhere(from, to), { isQualified: true }],
      },
    }),
    db.n7DeviceRecord.count({
      where: {
        AND: [
          ...scopeParts,
          registeredWhere(from, to),
          expiredAssessmentWhere(),
        ],
      },
    }),
  ]);

  return {
    dateFrom: follow.dateFrom,
    dateTo: follow.dateTo,
    manager: follow.manager,
    counts: {
      urgent: urgent.length,
      pending: pending.length,
      other: other.length,
      qualified: qualifiedInRange,
      followUp: follow.counts.followUp,
      expand: follow.totals.expandCount,
      expired: expiredInScope,
    },
    queues: {
      urgent: urgent.slice(0, N7_TODAY_LIST_CAP),
      other: other.slice(0, N7_TODAY_LIST_CAP),
    },
    listCap: N7_TODAY_LIST_CAP,
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
    followUpDone: device.followUpDone,
    followUpNote: device.followUpNote,
    followUpAt: toIso(device.followUpAt),
    followUpConnectStatus: device.followUpConnectStatus,
    followUpFlags: device.followUpFlags ?? [],
    followUpPhotoUrls: device.followUpPhotoUrls ?? [],
    followUpReviewNote: device.followUpReviewNote,
    followUpReviewAt: toIso(device.followUpReviewAt),
    followUpReviewByName: device.followUpReviewByName,
  };
}

export async function updateN7DeviceFollowUp(
  deviceSn: string,
  input: {
    followUpDone: boolean;
    /** 省略则保留原备注（列表一键标记用） */
    followUpNote?: string | null;
    followUpById: string;
    followUpConnectStatus?: string | null;
    followUpFlags?: string[];
    followUpPhotoUrls?: string[];
  }
) {
  const updated = await db.n7DeviceRecord.update({
    where: { deviceSn },
    data: {
      followUpDone: input.followUpDone,
      ...(input.followUpNote !== undefined
        ? { followUpNote: input.followUpNote?.trim() || null }
        : {}),
      followUpAt: input.followUpDone ? new Date() : null,
      followUpById: input.followUpDone ? input.followUpById : null,
      ...(input.followUpDone
        ? {
            followUpConnectStatus: input.followUpConnectStatus ?? null,
            followUpFlags: input.followUpFlags ?? [],
            followUpPhotoUrls: input.followUpPhotoUrls ?? [],
            followUpReviewNote: null,
            followUpReviewAt: null,
            followUpReviewById: null,
            followUpReviewByName: null,
          }
        : {
            followUpConnectStatus: null,
            followUpFlags: [],
            followUpPhotoUrls: [],
            followUpReviewNote: null,
            followUpReviewAt: null,
            followUpReviewById: null,
            followUpReviewByName: null,
          }),
    },
    select: {
      deviceSn: true,
      storeName: true,
      operatorName: true,
      managerUserId: true,
      managerName: true,
      salesUserId: true,
      followUpDone: true,
      followUpNote: true,
      followUpAt: true,
      followUpById: true,
      followUpConnectStatus: true,
      followUpFlags: true,
      followUpPhotoUrls: true,
    },
  });

  if (updated.followUpDone && updated.followUpAt) {
    const {
      resolveDeviceManagerUserId,
      notifyManagerFollowUpDone,
    } = await import("@/services/n7/notifications");
    const managerUserId = await resolveDeviceManagerUserId(updated);
    let managerNotified = false;
    if (managerUserId && managerUserId !== input.followUpById) {
      const actor = await db.user.findUnique({
        where: { id: input.followUpById },
        select: { name: true },
      });
      await notifyManagerFollowUpDone({
        managerUserId,
        deviceSn: updated.deviceSn,
        storeName: updated.storeName,
        operatorName: updated.operatorName,
        connectStatus: updated.followUpConnectStatus,
        flags: updated.followUpFlags,
        photoUrls: updated.followUpPhotoUrls,
        followUpByName: actor?.name ?? updated.operatorName,
        followUpAt: updated.followUpAt,
      });
      managerNotified = true;
    }
    return { ...updated, managerNotified };
  }

  return { ...updated, managerNotified: false };
}

/** 每日开单（按注册日） */
export async function getN7DailyPerformance(
  opts: N7RangeOpts & {
    managerKey?: string | null;
    staffKey?: string | null;
  }
) {
  const { from, to, dateFrom, dateTo } = resolveRange(opts);
  const where: Prisma.N7DeviceRecordWhereInput = {
    AND: [
      registeredWhere(from, to),
      ...(opts.managerKey
        ? [await buildManagerDeviceWhere(opts.managerKey)]
        : []),
      ...(opts.staffKey ? [await buildStaffDeviceWhere(opts.staffKey)] : []),
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
