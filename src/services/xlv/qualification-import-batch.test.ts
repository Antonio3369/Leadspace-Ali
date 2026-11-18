import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { xlvStatDateKey } from "@/lib/xlv-stat-date";
import { assessXlvQualification, xlvAssessmentStartDate } from "@/lib/xlv-rules";
import {
  planQualificationSnapshotBatches,
  type XlvDeviceQualificationInput,
} from "@/services/xlv/qualification-snapshot-batch";
import {
  dedupeXlvSnapshotsByStatDate,
  enrichXlvSnapshotDailyMetrics,
} from "@/services/xlv/snapshot-daily";

type XlvSnapshotRow = {
  deviceSn: string;
  statDate: Date;
  cumulativeUsers: number;
  cumulativeTxns: number;
  dailyUsers: number;
  dailyTxns: number;
  sleepDays: number;
  lastTxnDate: Date | null;
};

function xlvQualificationOf(
  device: Omit<XlvDeviceQualificationInput, "deviceSn">,
  snapshots: XlvSnapshotRow[]
) {
  return assessXlvQualification(device, snapshots, undefined, true);
}

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

function snap(
  deviceSn: string,
  y: number,
  m: number,
  d: number,
  users: number,
  txns: number
): XlvSnapshotRow {
  const statDate = utc(y, m, d);
  return {
    deviceSn,
    statDate,
    cumulativeUsers: users,
    cumulativeTxns: txns,
    dailyUsers: 0,
    dailyTxns: 0,
    sleepDays: 0,
    lastTxnDate: statDate,
  };
}

function enrichList(rows: XlvSnapshotRow[]) {
  return enrichXlvSnapshotDailyMetrics(dedupeXlvSnapshotsByStatDate(rows));
}

function snapshotsWithStartBound(
  store: Map<string, XlvSnapshotRow[]>,
  deviceSn: string,
  statDateFrom?: Date
): XlvSnapshotRow[] {
  const raw = store.get(deviceSn) ?? [];
  const filtered = statDateFrom
    ? raw.filter((s) => xlvStatDateKey(s.statDate) >= xlvStatDateKey(statDateFrom))
    : raw;
  return enrichList(filtered);
}

/** 逐台：仅该设备考核起点拉快照（黄金对照） */
function referenceStatuses(
  devices: XlvDeviceQualificationInput[],
  store: Map<string, XlvSnapshotRow[]>
) {
  const out = new Map<string, string>();
  for (const device of devices) {
    const start = xlvAssessmentStartDate(device);
    const snapshots = snapshotsWithStartBound(store, device.deviceSn, start ?? undefined);
    out.set(device.deviceSn, xlvQualificationOf(device, snapshots));
  }
  return out;
}

/** 导入新路径：按 planQualificationSnapshotBatches 分批下界加载 */
function batchedImportStatuses(
  devices: XlvDeviceQualificationInput[],
  store: Map<string, XlvSnapshotRow[]>,
  batchSize: number
) {
  const batches = planQualificationSnapshotBatches(devices, batchSize);
  const loaded = new Map<string, XlvSnapshotRow[]>();
  for (const batch of batches) {
    for (const deviceSn of batch.deviceSns) {
      loaded.set(
        deviceSn,
        snapshotsWithStartBound(store, deviceSn, batch.statDateFrom)
      );
    }
  }
  const out = new Map<string, string>();
  for (const device of devices) {
    const snapshots = loaded.get(device.deviceSn) ?? [];
    out.set(device.deviceSn, xlvQualificationOf(device, snapshots));
  }
  return out;
}

function countLoadedSnapshots(
  devices: XlvDeviceQualificationInput[],
  store: Map<string, XlvSnapshotRow[]>,
  mode: "batched" | "legacy-min",
  batchSize: number
) {
  const counts = new Map<string, number>();
  if (mode === "batched") {
    const batches = planQualificationSnapshotBatches(devices, batchSize);
    for (const batch of batches) {
      for (const deviceSn of batch.deviceSns) {
        counts.set(
          deviceSn,
          snapshotsWithStartBound(store, deviceSn, batch.statDateFrom).length
        );
      }
    }
    return counts;
  }
  for (let i = 0; i < devices.length; i += batchSize) {
    const chunk = devices.slice(i, i + batchSize);
    const earliestStart = chunk.reduce<Date | undefined>((min, d) => {
      const start = xlvAssessmentStartDate(d);
      if (!start) return min;
      if (!min || start < min) return min;
      return min;
    }, undefined);
    for (const d of chunk) {
      counts.set(
        d.deviceSn,
        snapshotsWithStartBound(store, d.deviceSn, earliestStart).length
      );
    }
  }
  return counts;
}

/** 旧导入 bug：整 chunk 用 min(考核起点)，无起点则全体无下界 */
function legacyMinStartChunkStatuses(
  devices: XlvDeviceQualificationInput[],
  store: Map<string, XlvSnapshotRow[]>,
  chunkSize = 80
) {
  const out = new Map<string, string>();
  for (let i = 0; i < devices.length; i += chunkSize) {
    const chunk = devices.slice(i, i + chunkSize);
    const earliestStart = chunk.reduce<Date | undefined>((min, d) => {
      const start = xlvAssessmentStartDate(d);
      if (!start) return min;
      if (!min || start < min) return start;
      return min;
    }, undefined);
    const statDateFrom = earliestStart;
    const map = new Map<string, XlvSnapshotRow[]>();
    for (const d of chunk) {
      map.set(
        d.deviceSn,
        snapshotsWithStartBound(store, d.deviceSn, statDateFrom)
      );
    }
    for (const device of chunk) {
      out.set(device.deviceSn, xlvQualificationOf(device, map.get(device.deviceSn) ?? []));
    }
  }
  return out;
}

describe("qualification import snapshot batching", () => {
  const devices: XlvDeviceQualificationInput[] = [
    {
      deviceSn: "SN-EARLY",
      firstTxnDate: utc(2024, 1, 15),
      relocatedAt: null,
      cumulativeUsers: 25,
      cumulativeTxns: 350,
    },
    {
      deviceSn: "SN-LATE",
      firstTxnDate: utc(2025, 6, 10),
      relocatedAt: null,
      cumulativeUsers: 5,
      cumulativeTxns: 40,
    },
    {
      deviceSn: "SN-RELOC",
      firstTxnDate: utc(2023, 5, 1),
      relocatedAt: utc(2025, 3, 1),
      cumulativeUsers: 22,
      cumulativeTxns: 310,
    },
    {
      deviceSn: "SN-NOSTART",
      firstTxnDate: null,
      relocatedAt: null,
      cumulativeUsers: 0,
      cumulativeTxns: 0,
    },
  ];

  const store = new Map<string, XlvSnapshotRow[]>([
    [
      "SN-EARLY",
      enrichList([
        snap("SN-EARLY", 2024, 1, 31, 22, 320),
        snap("SN-EARLY", 2024, 2, 28, 25, 350),
      ]),
    ],
    [
      "SN-LATE",
      enrichList([
        snap("SN-LATE", 2024, 8, 31, 1, 5),
        snap("SN-LATE", 2025, 1, 31, 2, 12),
        snap("SN-LATE", 2025, 6, 30, 18, 280),
        snap("SN-LATE", 2025, 7, 31, 22, 340),
      ]),
    ],
    [
      "SN-RELOC",
      enrichList([
        snap("SN-RELOC", 2023, 5, 31, 5, 50),
        snap("SN-RELOC", 2025, 3, 31, 20, 290),
        snap("SN-RELOC", 2025, 4, 30, 22, 310),
      ]),
    ],
    ["SN-NOSTART", []],
  ]);

  it("plans separate batches for no-start devices", () => {
    const batches = planQualificationSnapshotBatches(devices, 32);
    const noStartBatch = batches.find((b) => b.deviceSns.includes("SN-NOSTART"));
    assert.ok(noStartBatch);
    assert.equal(noStartBatch.statDateFrom, undefined);
    assert.deepEqual(noStartBatch.deviceSns, ["SN-NOSTART"]);
  });

  it("uses each cohort's own start when devices are not lumped into one batch", () => {
    const batches = planQualificationSnapshotBatches(devices, 1);
    const lateBatch = batches.find((b) => b.deviceSns.includes("SN-LATE"));
    const earlyBatch = batches.find((b) => b.deviceSns.includes("SN-EARLY"));
    assert.ok(lateBatch && earlyBatch);
    assert.equal(xlvStatDateKey(lateBatch!.statDateFrom!), "2025-06-10");
    assert.equal(xlvStatDateKey(earlyBatch!.statDateFrom!), "2024-01-15");
    assert.ok(!lateBatch!.deviceSns.includes("SN-EARLY"));
  });

  it("matches per-device reference statuses on mixed assessment anchors", () => {
    const reference = referenceStatuses(devices, store);
    const batched = batchedImportStatuses(devices, store, 2);
    assert.deepEqual(batched, reference);
  });

  it("matches reference under small batch sizes", () => {
    const reference = referenceStatuses(devices, store);
    const batched = batchedImportStatuses(devices, store, 1);
    assert.deepEqual(batched, reference);
  });

  it("legacy min-start chunk still matches caliber but sorted batches avoid one bound for all cohorts", () => {
    const reference = referenceStatuses(devices, store);
    const legacy = legacyMinStartChunkStatuses(devices, store, 80);
    assert.deepEqual(legacy, reference);

    const singleDeviceBatches = planQualificationSnapshotBatches(devices, 1);
    const lateBatch = singleDeviceBatches.find((b) =>
      b.deviceSns.includes("SN-LATE")
    )!;
    const earlyBatch = singleDeviceBatches.find((b) =>
      b.deviceSns.includes("SN-EARLY")
    )!;
    assert.notEqual(
      xlvStatDateKey(lateBatch.statDateFrom!),
      xlvStatDateKey(earlyBatch.statDateFrom!),
      "reintroducing single global min bound for late device batch"
    );
  });

  it("loads fewer snapshot rows for late cohort than legacy min-start chunk", () => {
    const batched = countLoadedSnapshots(devices, store, "batched", 1);
    const legacy = countLoadedSnapshots(devices, store, "legacy-min", 80);
    const batchedLate = batched.get("SN-LATE") ?? 0;
    const legacyLate = legacy.get("SN-LATE") ?? 0;
    assert.ok(batchedLate < legacyLate);
    assert.equal(batchedLate, 2);
    assert.equal(legacyLate, 4);
    const batchedStatuses = batchedImportStatuses(devices, store, 1);
    assert.deepEqual(batchedStatuses, referenceStatuses(devices, store));
  });
});