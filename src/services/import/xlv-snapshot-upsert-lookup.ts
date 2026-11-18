import type { Prisma } from "@/generated/prisma/client";
import { normalizeXlvStatDate, xlvStatDateKey } from "@/lib/xlv-stat-date";

export type SnapshotWrite = {
  deviceSn: string;
  statDate: Date;
  cumulativeUsers: number;
  cumulativeTxns: number;
  cumulativeAmount: number;
  lastTxnDate: Date | null;
  sleepDays: number;
  isActivated: boolean;
  firstTxnDate: Date | null;
  dailyUsers: number;
  dailyTxns: number;
  dailyAmount: number;
  importBatchId: string;
};

/** Build Prisma filter for only the (deviceSn, statDate) keys in this chunk. */
export function buildIncomingSnapshotPairWhere(
  incomingByKey: Map<string, SnapshotWrite>
): Prisma.XlvDeviceSnapshotWhereInput {
  const pairs = [...incomingByKey.values()];
  if (pairs.length === 0) {
    return { id: { in: ["__none__"] } };
  }
  return {
    OR: pairs.map((snap) => ({
      deviceSn: snap.deviceSn,
      statDate: snap.statDate,
    })),
  };
}

export function incomingSnapshotsByKey(
  slice: SnapshotWrite[],
  importBatchId: string
): Map<string, SnapshotWrite> {
  const incomingByKey = new Map<string, SnapshotWrite>();
  for (const snap of slice) {
    const statDate = normalizeXlvStatDate(snap.statDate);
    const key = `${snap.deviceSn}::${xlvStatDateKey(statDate)}`;
    incomingByKey.set(key, { ...snap, statDate, importBatchId });
  }
  return incomingByKey;
}

export function indexExistingSnapshotIds(
  existingRows: { id: string; deviceSn: string; statDate: Date }[]
): Map<string, string[]> {
  const existingIdsByKey = new Map<string, string[]>();
  for (const row of existingRows) {
    const key = `${row.deviceSn}::${xlvStatDateKey(row.statDate)}`;
    const ids = existingIdsByKey.get(key) ?? [];
    ids.push(row.id);
    existingIdsByKey.set(key, ids);
  }
  return existingIdsByKey;
}