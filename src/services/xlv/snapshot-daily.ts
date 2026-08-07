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

/** 图表：按日历日去重后，用累计差分生成当日展示值 */
export function resolveXlvChartDailyMetrics<
  T extends {
    statDate: string;
    cumulativeUsers: number;
    cumulativeTxns: number;
    dailyUsers: number;
    dailyTxns: number;
  },
>(points: T[]): T[] {
  const byDate = new Map<string, T>();

  for (const point of points) {
    const key = xlvStatDateKey(point.statDate);
    const existing = byDate.get(key);
    if (
      !existing ||
      point.cumulativeTxns > existing.cumulativeTxns ||
      (point.cumulativeTxns === existing.cumulativeTxns &&
        point.cumulativeUsers > existing.cumulativeUsers)
    ) {
      byDate.set(key, { ...point, statDate: key });
    }
  }

  const deduped = [...byDate.values()].sort((a, b) =>
    a.statDate.localeCompare(b.statDate)
  );

  return deduped.map((point, index) => {
    const previous = index > 0 ? deduped[index - 1] : null;
    if (!previous) return point;

    const usersDelta = deltaFromCumulative(
      point.cumulativeUsers,
      previous.cumulativeUsers
    );
    const txnsDelta = deltaFromCumulative(
      point.cumulativeTxns,
      previous.cumulativeTxns
    );

    return {
      ...point,
      dailyUsers: usersDelta != null ? usersDelta : point.dailyUsers,
      dailyTxns: txnsDelta != null ? txnsDelta : point.dailyTxns,
    };
  });
}
