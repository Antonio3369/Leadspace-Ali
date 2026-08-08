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

/** 同一天多条快照时，保留累计更大的一条（较新截面） */
export function dedupeXlvSnapshotsByStatDate<
  T extends {
    statDate: Date;
    cumulativeTxns: number;
    cumulativeUsers: number;
  },
>(snapshots: T[]): T[] {
  const byDate = new Map<string, T>();

  for (const snap of snapshots) {
    const key = xlvStatDateKey(snap.statDate);
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
  const enriched = deduped.map((snap) => ({
    ...snap,
    statDate: normalizeXlvStatDate(snap.statDate),
  }));
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

      if (usersDelta != null) snap.dailyUsers = usersDelta;
      if (txnsDelta != null) snap.dailyTxns = txnsDelta;
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
  opts?: { maxPoints?: number }
): XlvTxnActivityPoint[] {
  const enriched = enrichXlvSnapshotDailyMetrics(snapshots);
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

/** 考核月成绩：按自然月内实际收款日汇总（与交易趋势一致），装机月可无快照时用累计估算 */
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
    cumulativeUsers: number;
    cumulativeTxns: number;
  },
  allowInstallMonthFallback = false
): { users: number; txns: number; estimated: boolean } | null {
  const normalized = normalizeAssessmentSnapshots(snapshots);
  const trend = buildXlvTxnActivityTrend(normalized, { maxPoints: 9999 });
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  let users = 0;
  let txns = 0;
  for (const point of trend) {
    if (!point.date.startsWith(prefix)) continue;
    users += point.dailyUsers;
    txns += point.dailyTxns;
  }

  if (users > 0 || txns > 0) {
    return { users, txns, estimated: false };
  }

  if (!allowInstallMonthFallback || !device?.firstTxnDate) return null;

  const [fy, fm] = prefix.split("-").map(Number);
  const ft = xlvStatDateKey(device.firstTxnDate);
  const [dy, dm] = ft.split("-").map(Number);
  if (dy !== fy || dm !== fm) return null;

  if (device.cumulativeUsers > 0 || device.cumulativeTxns > 0) {
    return {
      users: device.cumulativeUsers,
      txns: device.cumulativeTxns,
      estimated: true,
    };
  }

  return null;
}
