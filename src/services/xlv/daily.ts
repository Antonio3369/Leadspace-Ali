import { db } from "@/lib/db";
import { getCurrentMonthRange, parseN7DateRange } from "@/lib/n7-date";
import type { SessionUser } from "@/lib/permissions";
import { xlvManagerDisplayName } from "@/lib/xlv-rules";
import { xlvStatDateKey } from "@/lib/xlv-stat-date";
import { detectXlvWakeUpDate } from "@/lib/xlv-wake-up";
import { loadXlvSnapshotMapAfterFollowUp } from "@/services/xlv/assessment";
import {
  assertCanViewXlv,
  buildXlvAssignedDeviceWhere,
  buildXlvRoleWhere,
  xlvManagerKeyOf,
  xlvStaffKeyOf,
} from "@/services/xlv/xlv-scope";
import { withXlvHeavyGate } from "./xlv-heavy-gate";

export type XlvDailyPoint = {
  date: string;
  followUpCount: number;
  wakeUpCount: number;
};

export type XlvDailyRow = {
  key: string;
  name: string;
  followUpCount: number;
  wakeUpCount: number;
  stillDormantCount: number;
  wakeUpRate: number;
};

export type XlvDailyAudience = "managers" | "staff" | "self";

type FollowedDevice = {
  deviceSn: string;
  managerUserId: string | null;
  managerName: string;
  salesUserId: string | null;
  operatorName: string;
  followUpAt: Date;
  sleepDays: number;
  lastTxnDate: Date | null;
  statDate: Date | null;
  wakeUpDate: string | null;
  woken: boolean;
};

function emptyPoint(date: string): XlvDailyPoint {
  return { date, followUpCount: 0, wakeUpCount: 0 };
}

function eachDayKey(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    keys.push(xlvStatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function tallyRow(
  key: string,
  name: string,
  devices: FollowedDevice[]
): XlvDailyRow {
  const followUpCount = devices.length;
  const wakeUpCount = devices.filter((d) => d.woken).length;
  const stillDormantCount = followUpCount - wakeUpCount;
  const wakeUpRate =
    followUpCount > 0
      ? Math.round((wakeUpCount / followUpCount) * 1000) / 10
      : 0;
  return {
    key,
    name,
    followUpCount,
    wakeUpCount,
    stillDormantCount,
    wakeUpRate,
  };
}

const FOLLOWED_DEVICE_SELECT = {
  deviceSn: true,
  managerUserId: true,
  managerName: true,
  salesUserId: true,
  operatorName: true,
  followUpAt: true,
  sleepDays: true,
  lastTxnDate: true,
  statDate: true,
} as const;

async function loadFollowedDevicesWithWake(
  user: SessionUser,
  followUpAt?: { gte: Date; lte: Date }
): Promise<FollowedDevice[]> {
  const rows = await db.xlvDeviceRecord.findMany({
    where: {
      AND: [
        buildXlvRoleWhere(user),
        buildXlvAssignedDeviceWhere(),
        { followUpAt: followUpAt ?? { not: null } },
      ],
    },
    select: FOLLOWED_DEVICE_SELECT,
  });

  const snapshotMap = await loadXlvSnapshotMapAfterFollowUp(rows);

  const enriched: FollowedDevice[] = [];
  for (const row of rows) {
    if (!row.followUpAt) continue;
    const snapshots = snapshotMap.get(row.deviceSn) ?? [];
    const wakeUpDate = detectXlvWakeUpDate(row, row.followUpAt, snapshots);
    enriched.push({
      ...row,
      followUpAt: row.followUpAt,
      wakeUpDate,
      woken: wakeUpDate !== null,
    });
  }
  return enriched;
}

function wakeUpRateOf(devices: FollowedDevice[]) {
  const followUpCount = devices.length;
  const wakeUpCount = devices.filter((d) => d.woken).length;
  return followUpCount > 0
    ? Math.round((wakeUpCount / followUpCount) * 1000) / 10
    : 0;
}

/** 本月关单唤醒率（与每日绩效 summary.wakeUpRate 同口径，不拉更早关单的历史快照） */
export async function getXlvMonthWakeUpRate(user: SessionUser) {
  return withXlvHeavyGate(async () => {
    assertCanViewXlv(user);
    const { from, to } = getCurrentMonthRange();
    const inPeriod = await loadFollowedDevicesWithWake(user, {
      gte: from,
      lte: to,
    });
    return wakeUpRateOf(inPeriod);
  });
}

export async function getXlvDailyPerformance(
  user: SessionUser,
  opts: {
    dateFrom?: string | null;
    dateTo?: string | null;
    month?: string | null;
  }
) {
  return withXlvHeavyGate(() => loadXlvDailyPerformance(user, opts));
}

/** 只拉所选日期范围内的关单设备；折线/排行与 summary 同口径，不再扫历史关单全量 */

async function loadXlvDailyPerformance(
  user: SessionUser,
  opts: {
    dateFrom?: string | null;
    dateTo?: string | null;
    month?: string | null;
  }
) {
  assertCanViewXlv(user);
  const { from, to, dateFrom, dateTo } = parseN7DateRange(opts);
  if (!from || !to) {
    throw new Error("请选择有效日期范围");
  }

  const inPeriod = await loadFollowedDevicesWithWake(user, {
    gte: from,
    lte: to,
  });

  const byDay = new Map<string, XlvDailyPoint>();
  for (const key of eachDayKey(from, to)) {
    byDay.set(key, emptyPoint(key));
  }

  for (const d of inPeriod) {
    const key = xlvStatDateKey(d.followUpAt);
    const point = byDay.get(key) ?? emptyPoint(key);
    point.followUpCount += 1;
    byDay.set(key, point);
  }

  for (const d of inPeriod) {
    if (!d.wakeUpDate) continue;
    const point = byDay.get(d.wakeUpDate);
    if (!point) continue;
    point.wakeUpCount += 1;
  }

  const points = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  const followUpCount = inPeriod.length;
  const wakeUpCount = inPeriod.filter((d) => d.woken).length;
  const stillDormantCount = followUpCount - wakeUpCount;
  const wakeUpRate = wakeUpRateOf(inPeriod);

  let audience: XlvDailyAudience;
  let ranking: XlvDailyRow[];

  if (user.role === "SALES") {
    audience = "self";
    ranking = [
      tallyRow(
        xlvStaffKeyOf({ salesUserId: user.id, operatorName: user.name }),
        user.name,
        inPeriod
      ),
    ];
  } else if (user.role === "MANAGER") {
    audience = "staff";
    const map = new Map<string, { name: string; devices: FollowedDevice[] }>();
    for (const d of inPeriod) {
      const key = xlvStaffKeyOf(d);
      const name = d.operatorName?.trim() || "未分配";
      const bucket = map.get(key) ?? { name, devices: [] };
      bucket.devices.push(d);
      map.set(key, bucket);
    }
    ranking = [...map.entries()]
      .map(([key, bucket]) => tallyRow(key, bucket.name, bucket.devices))
      .sort(
        (a, b) =>
          b.followUpCount - a.followUpCount ||
          b.wakeUpCount - a.wakeUpCount ||
          a.name.localeCompare(b.name, "zh-CN")
      );
  } else {
    audience = "managers";
    const map = new Map<string, { name: string; devices: FollowedDevice[] }>();
    for (const d of inPeriod) {
      const key = xlvManagerKeyOf(d);
      const name = xlvManagerDisplayName(d.managerName);
      const bucket = map.get(key) ?? { name, devices: [] };
      bucket.devices.push(d);
      map.set(key, bucket);
    }
    ranking = [...map.entries()]
      .map(([key, bucket]) => tallyRow(key, bucket.name, bucket.devices))
      .sort(
        (a, b) =>
          b.followUpCount - a.followUpCount ||
          b.wakeUpCount - a.wakeUpCount ||
          a.name.localeCompare(b.name, "zh-CN")
      );
  }

  return {
    dateFrom,
    dateTo,
    audience,
    summary: {
      followUpCount,
      wakeUpCount,
      stillDormantCount,
      wakeUpRate,
    },
    points,
    rows: ranking,
  };
}
