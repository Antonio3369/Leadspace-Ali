import { normalizeXlvStatDate, xlvStatDateKey } from "@/lib/xlv-stat-date";

/** 用相邻快照的累计差分推算/校正当日增量 */

type SnapshotDailyFields = {
  deviceSn: string;
  statDate: Date;
  cumulativeUsers: number;
  cumulativeTxns: number;
  dailyUsers: number;
  dailyTxns: number;
};

function deltaFromCumulative(current: number, previous: number) {
  if (current < previous) return null;
  return current - previous;
}

function sortByStatDate<T extends { statDate: Date }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      normalizeXlvStatDate(a.statDate).getTime() -
      normalizeXlvStatDate(b.statDate).getTime()
  );
}

function snapshotDedupeKey(snap: { deviceSn?: string; statDate: Date }) {
  const dateKey = xlvStatDateKey(snap.statDate);
  return snap.deviceSn ? `${snap.deviceSn}::${dateKey}` : dateKey;
}

/** 同设备同一天多条快照时，保留累计更大的一条（较新截面） */
export function dedupeXlvSnapshotsByStatDate<
  T extends {
    deviceSn?: string;
    statDate: Date;
    cumulativeTxns: number;
    cumulativeUsers: number;
  },
>(snapshots: T[]): T[] {
  const byDate = new Map<string, T>();

  for (const snap of snapshots) {
    const key = snapshotDedupeKey(snap);
    const existing = byDate.get(key);
    if (
      !existing ||
      snap.cumulativeTxns > existing.cumulativeTxns ||
      (snap.cumulativeTxns === existing.cumulativeTxns &&
        snap.cumulativeUsers > existing.cumulativeUsers)
    ) {
      byDate.set(key, { ...snap, statDate: normalizeXlvStatDate(snap.statDate) });
    }
  }

  return sortByStatDate([...byDate.values()]);
}

export function enrichXlvSnapshotDailyMetrics<T extends SnapshotDailyFields>(
  snapshots: T[]
): T[] {
  const deduped = dedupeXlvSnapshotsByStatDate(snapshots);
  const enriched = deduped
    .map((snap) => ({
      ...snap,
      statDate: normalizeXlvStatDate(snap.statDate),
    }))
    .sort(
      (a, b) =>
        a.deviceSn.localeCompare(b.deviceSn) ||
        a.statDate.getTime() - b.statDate.getTime()
    );

  const previousBySn = new Map<string, T>();

  for (const snap of enriched) {
    const previous = previousBySn.get(snap.deviceSn);
    if (previous) {
      const usersDelta = deltaFromCumulative(
        snap.cumulativeUsers,
        previous.cumulativeUsers
      );
      const txnsDelta = deltaFromCumulative(
        snap.cumulativeTxns,
        previous.cumulativeTxns
      );

      // 优先保留 Excel「当日」列；仅在缺失时用累计差分补全
      if (snap.dailyUsers <= 0 && usersDelta != null) {
        snap.dailyUsers = usersDelta;
      }
      if (snap.dailyTxns <= 0 && txnsDelta != null) {
        snap.dailyTxns = txnsDelta;
      }
    }
    previousBySn.set(snap.deviceSn, snap);
  }

  return enriched;
}

export type XlvTxnActivityPoint = {
  date: string;
  dailyTxns: number;
  dailyUsers: number;
  cumulativeTxns: number;
  cumulativeUsers: number;
  sleepDays: number;
};

function activityDateKey(snap: {
  statDate: Date;
  lastTxnDate: Date | null;
}): string {
  if (snap.lastTxnDate) {
    const lastKey = xlvStatDateKey(snap.lastTxnDate);
    const statKey = xlvStatDateKey(snap.statDate);
    if (lastKey <= statKey) return lastKey;
  }
  return xlvStatDateKey(snap.statDate);
}

/** 仅有收款的日期：用当日/差分笔数，横轴优先末笔交易日（非导入快照日） */
export function buildXlvTxnActivityTrend(
  snapshots: Array<{
    deviceSn: string;
    statDate: Date;
    lastTxnDate: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
    dailyUsers: number;
    dailyTxns: number;
    sleepDays: number;
  }>,
  opts?: { maxPoints?: number; skipEnrich?: boolean }
): XlvTxnActivityPoint[] {
  const enriched = opts?.skipEnrich
    ? snapshots
    : enrichXlvSnapshotDailyMetrics(snapshots);
  const byDate = new Map<string, XlvTxnActivityPoint>();

  for (const snap of enriched) {
    const dailyTxns = snap.dailyTxns;
    const dailyUsers = snap.dailyUsers;
    if (dailyTxns <= 0 && dailyUsers <= 0) continue;

    const date = activityDateKey(snap);
    const existing = byDate.get(date);
    if (existing) {
      existing.dailyTxns += dailyTxns;
      existing.dailyUsers += dailyUsers;
      existing.cumulativeTxns = Math.max(existing.cumulativeTxns, snap.cumulativeTxns);
      existing.cumulativeUsers = Math.max(
        existing.cumulativeUsers,
        snap.cumulativeUsers
      );
      if (xlvStatDateKey(snap.statDate) >= date) {
        existing.sleepDays = snap.sleepDays;
      }
    } else {
      byDate.set(date, {
        date,
        dailyTxns,
        dailyUsers,
        cumulativeTxns: snap.cumulativeTxns,
        cumulativeUsers: snap.cumulativeUsers,
        sleepDays: snap.sleepDays,
      });
    }
  }

  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const maxPoints = opts?.maxPoints ?? 31;
  return sorted.length > maxPoints ? sorted.slice(-maxPoints) : sorted;
}

export type XlvAssessmentSnapshot = {
  deviceSn: string;
  statDate: Date;
  lastTxnDate: Date | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  dailyUsers: number;
  dailyTxns: number;
  sleepDays: number;
};

function normalizeAssessmentSnapshots(
  snapshots: Array<{
    deviceSn?: string;
    statDate: Date;
    lastTxnDate?: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
    dailyUsers?: number;
    dailyTxns?: number;
    sleepDays?: number;
  }>
): XlvAssessmentSnapshot[] {
  return snapshots.map((snap, index) => ({
    deviceSn: snap.deviceSn ?? `snap-${index}`,
    statDate: snap.statDate,
    lastTxnDate: snap.lastTxnDate ?? null,
    cumulativeUsers: snap.cumulativeUsers,
    cumulativeTxns: snap.cumulativeTxns,
    dailyUsers: snap.dailyUsers ?? 0,
    dailyTxns: snap.dailyTxns ?? 0,
    sleepDays: snap.sleepDays ?? 0,
  }));
}

function isSnapshotInCalendarMonth(statDate: Date, year: number, month: number) {
  const [y, m] = xlvStatDateKey(statDate).split("-").map(Number);
  return y === year && m === month;
}

function nextCalendarMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function prevCalendarMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/**
 * 自然月末累计截面（对齐微信原始表）：
 * 1. 次月首行「累计* − 当日*」≈ 上月末累计（原始表常从 8/1 起，无 7 月 statDate）
 * 2. 否则取该月最后一条快照的累计
 */
function getXlvCalendarMonthEndCumulative(
  enriched: XlvAssessmentSnapshot[],
  year: number,
  month: number
): { users: number; txns: number } | null {
  const { year: nextY, month: nextM } = nextCalendarMonth(year, month);
  const nextMonthSnaps = enriched
    .filter((s) => isSnapshotInCalendarMonth(s.statDate, nextY, nextM))
    .sort((a, b) => a.statDate.getTime() - b.statDate.getTime());

  if (nextMonthSnaps.length > 0) {
    const first = nextMonthSnaps[0]!;
    const users = Math.max(0, first.cumulativeUsers - Math.max(0, first.dailyUsers));
    const txns = Math.max(0, first.cumulativeTxns - Math.max(0, first.dailyTxns));
    if (users > 0 || txns > 0) {
      return { users, txns };
    }
  }

  const inMonth = enriched
    .filter((s) => isSnapshotInCalendarMonth(s.statDate, year, month))
    .sort((a, b) => a.statDate.getTime() - b.statDate.getTime());

  if (inMonth.length > 0) {
    const last = inMonth[inMonth.length - 1]!;
    if (last.cumulativeUsers > 0 || last.cumulativeTxns > 0) {
      return { users: last.cumulativeUsers, txns: last.cumulativeTxns };
    }
  }

  return null;
}

/** 考核月成绩：月末累计截面（装机月）或两月末截面差（次月），与微信表「累计*」口径一致 */
export function computeXlvMonthAssessmentTotals(
  snapshots: Array<{
    deviceSn?: string;
    statDate: Date;
    lastTxnDate?: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
    dailyUsers?: number;
    dailyTxns?: number;
    sleepDays?: number;
  }>,
  year: number,
  month: number,
  device?: {
    firstTxnDate: Date | null;
    statDate?: Date | null;
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  allowInstallMonthFallback = false,
  snapshotsPreEnriched = false
): { users: number; txns: number; estimated: boolean } | null {
  const normalized = normalizeAssessmentSnapshots(snapshots);
  const enriched = snapshotsPreEnriched
    ? normalized
    : enrichXlvSnapshotDailyMetrics(normalized);

  const monthEnd = getXlvCalendarMonthEndCumulative(enriched, year, month);

  if (allowInstallMonthFallback) {
    if (monthEnd) {
      return { ...monthEnd, estimated: false };
    }
  } else if (monthEnd) {
    const { year: prevY, month: prevM } = prevCalendarMonth(year, month);
    const prevEnd = getXlvCalendarMonthEndCumulative(enriched, prevY, prevM);

    const users = Math.max(0, monthEnd.users - (prevEnd?.users ?? 0));
    const txns = Math.max(0, monthEnd.txns - (prevEnd?.txns ?? 0));

    if (users > 0 || txns > 0) {
      return { users, txns, estimated: false };
    }
  }

  if (!allowInstallMonthFallback || !device?.firstTxnDate) return null;

  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const [fy, fm] = prefix.split("-").map(Number);
  const ft = xlvStatDateKey(device.firstTxnDate);
  const [dy, dm] = ft.split("-").map(Number);
  if (dy !== fy || dm !== fm) return null;

  // 无日快照时：仅当最新截面仍在装机月内才用设备累计，避免把 8 月累计误当 7 月成绩
  if (device.statDate) {
    const [sy, sm] = xlvStatDateKey(device.statDate).split("-").map(Number);
    if (sy > fy || (sy === fy && sm > fm)) return null;
  }

  if (device.cumulativeUsers > 0 || device.cumulativeTxns > 0) {
    return {
      users: device.cumulativeUsers,
      txns: device.cumulativeTxns,
      estimated: true,
    };
  }

  return null;
}
