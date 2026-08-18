import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizeXlvStatDate, xlvStatDateKey } from "@/lib/xlv-stat-date";
import type { ParsedXlvRawRow } from "@/services/import/xlv-excel-parser";

function createId() {
  return `c${randomBytes(12).toString("hex")}`;
}

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

export type XlvImportProgress = (
  progress: number,
  message: string
) => void | Promise<void>;

type ExistingDevice = {
  deviceSn: string;
  statDate: Date | null;
  merchantName: string | null;
  companyName: string | null;
  operatorName: string;
  managerName: string;
};

type DeviceRawUpdate = {
  deviceSn: string;
  statDate: Date;
  agentId: string | null;
  agentName: string | null;
  activationMerchantName: string | null;
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
  merchantName: string | null;
  companyName: string | null;
  importBatchId: string;
};

const SNAPSHOT_CHUNK = 500;
const DEVICE_UPDATE_CHUNK = 150;
const DEVICE_LOOKUP_CHUNK = 1000;

function isoOrEmpty(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

/** 批量写入快照：每批一次查、一次删、一次插 */
export async function upsertSnapshotsBulk(
  snapshots: SnapshotWrite[],
  importBatchId: string,
  onProgress?: XlvImportProgress
) {
  const stats = {
    created: 0,
    updated: 0,
    duplicatesRemoved: 0,
  };

  const totalChunks = Math.max(1, Math.ceil(snapshots.length / SNAPSHOT_CHUNK));

  for (let i = 0; i < snapshots.length; i += SNAPSHOT_CHUNK) {
    const slice = snapshots.slice(i, i + SNAPSHOT_CHUNK);
    const chunkIndex = Math.floor(i / SNAPSHOT_CHUNK) + 1;

    const incomingByKey = new Map<string, SnapshotWrite>();
    for (const snap of slice) {
      const statDate = normalizeXlvStatDate(snap.statDate);
      const key = `${snap.deviceSn}::${xlvStatDateKey(statDate)}`;
      incomingByKey.set(key, { ...snap, statDate, importBatchId });
    }

    const sns = [...new Set(slice.map((s) => s.deviceSn))];
    const existingRows = await db.xlvDeviceSnapshot.findMany({
      where: { deviceSn: { in: sns } },
      select: { id: true, deviceSn: true, statDate: true },
    });

    const existingIdsByKey = new Map<string, string[]>();
    for (const row of existingRows) {
      const key = `${row.deviceSn}::${xlvStatDateKey(row.statDate)}`;
      if (!incomingByKey.has(key)) continue;
      const ids = existingIdsByKey.get(key) ?? [];
      ids.push(row.id);
      existingIdsByKey.set(key, ids);
    }

    const idsToDelete: string[] = [];
    let chunkCreated = 0;
    let chunkUpdated = 0;
    let chunkDuplicatesRemoved = 0;

    for (const key of incomingByKey.keys()) {
      const ids = existingIdsByKey.get(key) ?? [];
      if (ids.length > 0) {
        chunkUpdated += 1;
        if (ids.length > 1) {
          chunkDuplicatesRemoved += ids.length - 1;
        }
        idsToDelete.push(...ids);
      } else {
        chunkCreated += 1;
      }
    }

    stats.created += chunkCreated;
    stats.updated += chunkUpdated;
    stats.duplicatesRemoved += chunkDuplicatesRemoved;

    if (idsToDelete.length > 0) {
      await db.xlvDeviceSnapshot.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    await db.xlvDeviceSnapshot.createMany({
      data: [...incomingByKey.values()].map((snap) => ({
        id: createId(),
        deviceSn: snap.deviceSn,
        statDate: snap.statDate,
        cumulativeUsers: snap.cumulativeUsers,
        cumulativeTxns: snap.cumulativeTxns,
        cumulativeAmount: snap.cumulativeAmount,
        lastTxnDate: snap.lastTxnDate,
        sleepDays: snap.sleepDays,
        isActivated: snap.isActivated,
        firstTxnDate: snap.firstTxnDate,
        dailyUsers: snap.dailyUsers,
        dailyTxns: snap.dailyTxns,
        dailyAmount: snap.dailyAmount,
        importBatchId,
      })),
    });

    const progress = 25 + Math.round((chunkIndex / totalChunks) * 50);
    await onProgress?.(
      progress,
      `写入快照 ${Math.min(i + slice.length, snapshots.length).toLocaleString()} / ${snapshots.length.toLocaleString()} 行…`
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return stats;
}

async function loadExistingDevices(deviceSns: string[]) {
  const map = new Map<string, ExistingDevice>();
  for (let i = 0; i < deviceSns.length; i += DEVICE_LOOKUP_CHUNK) {
    const chunk = deviceSns.slice(i, i + DEVICE_LOOKUP_CHUNK);
    const rows = await db.xlvDeviceRecord.findMany({
      where: { deviceSn: { in: chunk } },
      select: {
        deviceSn: true,
        statDate: true,
        merchantName: true,
        companyName: true,
        operatorName: true,
        managerName: true,
      },
    });
    for (const row of rows) {
      map.set(row.deviceSn, row);
    }
  }
  return map;
}

function buildDeviceUpdates(
  latestBySn: Map<string, ParsedXlvRawRow>,
  existingBySn: Map<string, ExistingDevice>,
  importBatchId: string
) {
  const updates: DeviceRawUpdate[] = [];
  let createdDevices = 0;
  let updatedDevices = 0;

  for (const row of latestBySn.values()) {
    const existing = existingBySn.get(row.deviceSn);
    const hadMetrics = Boolean(existing?.statDate);
    if (hadMetrics) updatedDevices += 1;
    else createdDevices += 1;

    updates.push({
      deviceSn: row.deviceSn,
      statDate: normalizeXlvStatDate(row.statDate),
      agentId: row.agentId,
      agentName: row.agentName,
      activationMerchantName: row.activationMerchantName,
      cumulativeUsers: row.cumulativeUsers,
      cumulativeTxns: row.cumulativeTxns,
      cumulativeAmount: row.cumulativeAmount,
      lastTxnDate: row.lastTxnDate,
      sleepDays: row.sleepDays,
      isActivated: row.isActivated,
      firstTxnDate: row.firstTxnDate,
      dailyUsers: row.dailyUsers,
      dailyTxns: row.dailyTxns,
      dailyAmount: row.dailyAmount,
      merchantName:
        existing?.merchantName || row.activationMerchantName || null,
      companyName: existing?.companyName || row.agentName || null,
      importBatchId,
    });
  }

  return { updates, createdDevices, updatedDevices };
}

async function bulkUpdateXlvDevices(rows: DeviceRawUpdate[]) {
  for (let i = 0; i < rows.length; i += DEVICE_UPDATE_CHUNK) {
    const chunk = rows.slice(i, i + DEVICE_UPDATE_CHUNK);
    await db.$executeRaw`
      UPDATE "XlvDeviceRecord" AS d
      SET
        "statDate" = NULLIF(v."statDate", '')::timestamptz,
        "agentId" = NULLIF(v."agentId", '')::text,
        "agentName" = NULLIF(v."agentName", '')::text,
        "activationMerchantName" = NULLIF(v."activationMerchantName", '')::text,
        "cumulativeUsers" = v."cumulativeUsers"::integer,
        "cumulativeTxns" = v."cumulativeTxns"::integer,
        "cumulativeAmount" = v."cumulativeAmount"::double precision,
        "lastTxnDate" = NULLIF(v."lastTxnDate", '')::timestamptz,
        "sleepDays" = v."sleepDays"::integer,
        "isActivated" = v."isActivated"::boolean,
        "firstTxnDate" = NULLIF(v."firstTxnDate", '')::timestamptz,
        "dailyUsers" = v."dailyUsers"::integer,
        "dailyTxns" = v."dailyTxns"::integer,
        "dailyAmount" = v."dailyAmount"::double precision,
        "merchantName" = NULLIF(v."merchantName", '')::text,
        "companyName" = NULLIF(v."companyName", '')::text,
        "importBatchId" = NULLIF(v."importBatchId", '')::text,
        "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(
        chunk.map(
          (r) =>
            Prisma.sql`(
              ${r.deviceSn},
              ${isoOrEmpty(r.statDate)},
              ${r.agentId ?? ""},
              ${r.agentName ?? ""},
              ${r.activationMerchantName ?? ""},
              ${r.cumulativeUsers},
              ${r.cumulativeTxns},
              ${r.cumulativeAmount},
              ${isoOrEmpty(r.lastTxnDate)},
              ${r.sleepDays},
              ${r.isActivated},
              ${isoOrEmpty(r.firstTxnDate)},
              ${r.dailyUsers},
              ${r.dailyTxns},
              ${r.dailyAmount},
              ${r.merchantName ?? ""},
              ${r.companyName ?? ""},
              ${r.importBatchId}
            )`
        )
      )}) AS v(
        "deviceSn", "statDate", "agentId", "agentName", "activationMerchantName",
        "cumulativeUsers", "cumulativeTxns", "cumulativeAmount",
        "lastTxnDate", "sleepDays", "isActivated", "firstTxnDate",
        "dailyUsers", "dailyTxns", "dailyAmount",
        "merchantName", "companyName", "importBatchId"
      )
      WHERE d."deviceSn" = v."deviceSn"::text
    `;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

export async function bulkUpdateDevicesFromRaw(
  latestBySn: Map<string, ParsedXlvRawRow>,
  importBatchId: string,
  onProgress?: XlvImportProgress
) {
  const deviceSns = [...latestBySn.keys()];
  const existingBySn = await loadExistingDevices(deviceSns);
  const { updates, createdDevices, updatedDevices } = buildDeviceUpdates(
    latestBySn,
    existingBySn,
    importBatchId
  );

  await onProgress?.(80, `更新设备最新状态 ${deviceSns.length.toLocaleString()} 台…`);
  await bulkUpdateXlvDevices(updates);
  await onProgress?.(92, "设备状态写入完成");

  return { createdDevices, updatedDevices };
}

export type AssignmentDeviceWrite = {
  id: string;
  deviceSn: string;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  merchantName: string | null;
  salesUserId: string | null;
  managerUserId: string | null;
  statDate: Date | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  cumulativeAmount: number;
  lastTxnDate: Date | null;
  sleepDays: number;
  isActivated: boolean;
  firstTxnDate: Date | null;
  importBatchId: string;
};

const ASSIGNMENT_CREATE_CHUNK = 300;
const ASSIGNMENT_UPDATE_CHUNK = 150;

export async function bulkUpsertAssignmentDevices(
  creates: AssignmentDeviceWrite[],
  updates: AssignmentDeviceWrite[],
  onProgress?: XlvImportProgress
) {
  for (let i = 0; i < creates.length; i += ASSIGNMENT_CREATE_CHUNK) {
    const slice = creates.slice(i, i + ASSIGNMENT_CREATE_CHUNK);
    await db.xlvDeviceRecord.createMany({
      data: slice.map((r) => ({
        id: r.id,
        deviceSn: r.deviceSn,
        operatorName: r.operatorName,
        managerName: r.managerName,
        companyName: r.companyName,
        merchantName: r.merchantName,
        salesUserId: r.salesUserId,
        managerUserId: r.managerUserId,
        statDate: r.statDate,
        cumulativeUsers: r.cumulativeUsers,
        cumulativeTxns: r.cumulativeTxns,
        cumulativeAmount: r.cumulativeAmount,
        lastTxnDate: r.lastTxnDate,
        sleepDays: r.sleepDays,
        isActivated: r.isActivated,
        firstTxnDate: r.firstTxnDate,
        sourceMode: "MANUAL_UPLOAD" as const,
        importBatchId: r.importBatchId,
      })),
      skipDuplicates: true,
    });
    const pct = 30 + Math.round(((i + slice.length) / Math.max(creates.length, 1)) * 25);
    await onProgress?.(
      Math.min(pct, 55),
      `新建设备 ${Math.min(i + slice.length, creates.length).toLocaleString()} / ${creates.length.toLocaleString()}…`
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  for (let i = 0; i < updates.length; i += ASSIGNMENT_UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + ASSIGNMENT_UPDATE_CHUNK);
    await db.$executeRaw`
      UPDATE "XlvDeviceRecord" AS d
      SET
        "operatorName" = v."operatorName"::text,
        "managerName" = v."managerName"::text,
        "companyName" = NULLIF(v."companyName", '')::text,
        "merchantName" = NULLIF(v."merchantName", '')::text,
        "salesUserId" = NULLIF(v."salesUserId", '')::text,
        "managerUserId" = NULLIF(v."managerUserId", '')::text,
        "statDate" = NULLIF(v."statDate", '')::timestamptz,
        "cumulativeUsers" = v."cumulativeUsers"::integer,
        "cumulativeTxns" = v."cumulativeTxns"::integer,
        "cumulativeAmount" = v."cumulativeAmount"::double precision,
        "lastTxnDate" = NULLIF(v."lastTxnDate", '')::timestamptz,
        "sleepDays" = v."sleepDays"::integer,
        "isActivated" = v."isActivated"::boolean,
        "firstTxnDate" = NULLIF(v."firstTxnDate", '')::timestamptz,
        "importBatchId" = NULLIF(v."importBatchId", '')::text,
        "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(
        chunk.map(
          (r) =>
            Prisma.sql`(
              ${r.deviceSn},
              ${r.operatorName},
              ${r.managerName},
              ${r.companyName ?? ""},
              ${r.merchantName ?? ""},
              ${r.salesUserId ?? ""},
              ${r.managerUserId ?? ""},
              ${isoOrEmpty(r.statDate)},
              ${r.cumulativeUsers},
              ${r.cumulativeTxns},
              ${r.cumulativeAmount},
              ${isoOrEmpty(r.lastTxnDate)},
              ${r.sleepDays},
              ${r.isActivated},
              ${isoOrEmpty(r.firstTxnDate)},
              ${r.importBatchId}
            )`
        )
      )}) AS v(
        "deviceSn", "operatorName", "managerName", "companyName", "merchantName",
        "salesUserId", "managerUserId", "statDate",
        "cumulativeUsers", "cumulativeTxns", "cumulativeAmount",
        "lastTxnDate", "sleepDays", "isActivated", "firstTxnDate", "importBatchId"
      )
      WHERE d."deviceSn" = v."deviceSn"::text
    `;
    const done = i + chunk.length;
    const pct = 55 + Math.round((done / Math.max(updates.length, 1)) * 30);
    await onProgress?.(
      Math.min(pct, 85),
      `更新归属 ${done.toLocaleString()} / ${updates.length.toLocaleString()}…`
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
