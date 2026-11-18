import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeXlvStatDate } from "@/lib/xlv-stat-date";
import {
  buildIncomingSnapshotPairWhere,
  indexExistingSnapshotIds,
  type SnapshotWrite,
} from "@/services/import/xlv-snapshot-upsert-lookup";

function snap(deviceSn: string, statKey: string): SnapshotWrite {
  return {
    deviceSn,
    statDate: normalizeXlvStatDate(statKey),
    cumulativeUsers: 1,
    cumulativeTxns: 2,
    cumulativeAmount: 3,
    lastTxnDate: null,
    sleepDays: 0,
    isActivated: true,
    firstTxnDate: null,
    dailyUsers: 0,
    dailyTxns: 0,
    dailyAmount: 0,
    importBatchId: "batch",
  };
}

describe("upsert snapshot lookup scope", () => {
  it("queries only incoming (deviceSn, statDate) pairs", () => {
    const incoming = new Map<string, SnapshotWrite>([
      ["SN1::2026-11-17", snap("SN1", "2026-11-17")],
      ["SN1::2026-11-18", snap("SN1", "2026-11-18")],
      ["SN2::2026-11-17", snap("SN2", "2026-11-17")],
    ]);
    const where = buildIncomingSnapshotPairWhere(incoming);
    assert.ok(Array.isArray(where.OR));
    assert.equal(where.OR!.length, 3);
  });

  it("collects all existing ids for a duplicated key", () => {
    const statDate = normalizeXlvStatDate("2026-11-17");
    const existingRows = [
      { id: "a", deviceSn: "SN9", statDate },
      { id: "b", deviceSn: "SN9", statDate },
      { id: "c", deviceSn: "SN9", statDate },
    ];
    const byKey = indexExistingSnapshotIds(existingRows);
    const ids = byKey.get("SN9::2026-11-17") ?? [];
    assert.deepEqual(ids.sort(), ["a", "b", "c"]);
  });
});