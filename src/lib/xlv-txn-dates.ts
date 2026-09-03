import { normalizeXlvStatDate, xlvStatDateKey } from "@/lib/xlv-stat-date";

function earlier(a: Date, b: Date) {
  return xlvStatDateKey(a) <= xlvStatDateKey(b) ? a : b;
}

function later(a: Date, b: Date) {
  return xlvStatDateKey(a) >= xlvStatDateKey(b) ? a : b;
}

type TxnDateSource = {
  firstTxnDate?: Date | null;
  lastTxnDate?: Date | null;
  statDate?: Date | null;
  cumulativeUsers?: number;
  cumulativeTxns?: number;
};

/** 运营表漏填首末笔时，用快照/统计日把日期补回来，避免「有累计却显示 —」 */
export function inferXlvTxnDates(
  device: TxnDateSource,
  snapshots: TxnDateSource[] = []
): { firstTxnDate: Date | null; lastTxnDate: Date | null } {
  const firsts: Date[] = [];
  const lasts: Date[] = [];

  const push = (list: Date[], value: Date | null | undefined) => {
    if (!value) return;
    list.push(normalizeXlvStatDate(value));
  };

  push(firsts, device.firstTxnDate);
  push(lasts, device.lastTxnDate);
  for (const snap of snapshots) {
    push(firsts, snap.firstTxnDate);
    push(lasts, snap.lastTxnDate);
  }

  let first = firsts.length > 0 ? firsts.reduce(earlier) : null;
  let last = lasts.length > 0 ? lasts.reduce(later) : null;

  if (!last) {
    const active = [...snapshots]
      .filter(
        (s) => (s.cumulativeTxns ?? 0) > 0 || (s.cumulativeUsers ?? 0) > 0
      )
      .sort((a, b) =>
        xlvStatDateKey(b.statDate ?? new Date(0)).localeCompare(
          xlvStatDateKey(a.statDate ?? new Date(0))
        )
      )[0];
    if (active?.statDate) last = normalizeXlvStatDate(active.statDate);
  }

  if (
    !last &&
    ((device.cumulativeTxns ?? 0) > 0 || (device.cumulativeUsers ?? 0) > 0) &&
    device.statDate
  ) {
    last = normalizeXlvStatDate(device.statDate);
  }

  if (!first && lasts.length > 0) first = lasts.reduce(earlier);
  if (!first && last) first = last;

  return { firstTxnDate: first, lastTxnDate: last };
}
