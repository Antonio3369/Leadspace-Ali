import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import {
  parseXlvExcelBuffer,
  type ParsedXlvPersonnelRow,
  type ParsedXlvRawRow,
} from "@/services/import/xlv-excel-parser";
import {
  buildUserLookupIndexes,
  findManagerInIndexes,
  findN7SalesInIndexes,
} from "@/services/org/user-matcher";
import { enrichXlvSnapshotDailyMetrics } from "@/services/xlv/snapshot-daily";
import { normalizeXlvStatDate, xlvStatDateKey } from "@/lib/xlv-stat-date";
import type { XlvImportSummary } from "@/services/import/xlv-import-summary";

function createId() {
  return `c${randomBytes(12).toString("hex")}`;
}

export interface XlvImportResult {
  importLogId?: string;
  format: "raw" | "personnel";
  totalRows: number;
  importedRows: number;
  snapshotRows: number;
  createdDevices: number;
  updatedDevices: number;
  skippedRows: number;
  sheetName?: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errors: string[];
  summary?: XlvImportSummary;
}

type SnapshotWrite = {
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

function pickLatestRawBySn(rows: ParsedXlvRawRow[]) {
  const map = new Map<string, ParsedXlvRawRow>();
  for (const row of rows) {
    const prev = map.get(row.deviceSn);
    if (!prev || row.statDate.getTime() > prev.statDate.getTime()) {
      map.set(row.deviceSn, row);
    }
  }
  return map;
}

function uniqueSnapshots(rows: ParsedXlvRawRow[]): SnapshotWrite[] {
  const seen = new Map<string, SnapshotWrite>();
  for (const row of rows) {
    const statDate = normalizeXlvStatDate(row.statDate);
    const key = `${row.deviceSn}::${xlvStatDateKey(statDate)}`;
    const next: SnapshotWrite = {
      deviceSn: row.deviceSn,
      statDate,
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
      importBatchId: "",
    };
    const existing = seen.get(key);
    if (
      !existing ||
      next.cumulativeTxns > existing.cumulativeTxns ||
      (next.cumulativeTxns === existing.cumulativeTxns &&
        next.cumulativeUsers > existing.cumulativeUsers)
    ) {
      seen.set(key, next);
    }
  }
  return [...seen.values()];
}

async function upsertSnapshots(
  snapshots: SnapshotWrite[],
  importBatchId: string
) {
  const stats = {
    created: 0,
    updated: 0,
    duplicatesRemoved: 0,
  };

  const CHUNK = 100;
  for (let i = 0; i < snapshots.length; i += CHUNK) {
    const slice = snapshots.slice(i, i + CHUNK);
    for (const snap of slice) {
      const statDate = normalizeXlvStatDate(snap.statDate);
      const dateKey = xlvStatDateKey(statDate);
      const existingRows = await db.xlvDeviceSnapshot.findMany({
        where: { deviceSn: snap.deviceSn },
        select: { id: true, statDate: true },
      });
      const sameDay = existingRows.filter(
        (row) => xlvStatDateKey(row.statDate) === dateKey
      );

      const data = {
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
      };

      if (sameDay.length > 0) {
        await db.xlvDeviceSnapshot.update({
          where: { id: sameDay[0]!.id },
          data: {
            ...data,
            statDate,
          },
        });
        stats.updated += 1;
        if (sameDay.length > 1) {
          stats.duplicatesRemoved += sameDay.length - 1;
        }
        for (const dup of sameDay.slice(1)) {
          await db.xlvDeviceSnapshot.delete({ where: { id: dup.id } });
        }
      } else {
        await db.xlvDeviceSnapshot.create({
          data: {
            id: createId(),
            deviceSn: snap.deviceSn,
            statDate,
            ...data,
          },
        });
        stats.created += 1;
      }
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return stats;
}

function statDateRangeFromRows(rows: ParsedXlvRawRow[]) {
  const keys = rows
    .map((row) => xlvStatDateKey(row.statDate))
    .filter(Boolean)
    .sort();
  if (keys.length === 0) return undefined;
  return { min: keys[0]!, max: keys[keys.length - 1]! };
}

async function importRawRows(
  rows: ParsedXlvRawRow[],
  importBatchId: string,
  indexes: Awaited<ReturnType<typeof buildUserLookupIndexes>>
) {
  const dedupedSnapshots = uniqueSnapshots(rows);
  const snapshots = enrichXlvSnapshotDailyMetrics(dedupedSnapshots);
  for (const s of snapshots) s.importBatchId = importBatchId;

  const latestBySn = pickLatestRawBySn(rows);
  const allSns = new Set([
    ...snapshots.map((s) => s.deviceSn),
    ...latestBySn.keys(),
  ]);

  await db.xlvDeviceRecord.createMany({
    data: [...allSns].map((deviceSn) => ({ id: createId(), deviceSn })),
    skipDuplicates: true,
  });

  const snapshotStats = await upsertSnapshots(snapshots, importBatchId);

  let createdDevices = 0;
  let updatedDevices = 0;

  for (const row of latestBySn.values()) {
    const existing = await db.xlvDeviceRecord.findUnique({
      where: { deviceSn: row.deviceSn },
    });
    const hadMetrics = Boolean(existing?.statDate);

    const managerUser = existing?.managerName
      ? findManagerInIndexes(indexes, existing.managerName)
      : null;
    const salesUser =
      existing?.operatorName && existing?.managerName
        ? findN7SalesInIndexes(
            indexes,
            existing.operatorName,
            managerUser
          )
        : null;

    const merchantName =
      existing?.merchantName ||
      row.activationMerchantName ||
      null;
    const companyName = existing?.companyName || row.agentName || null;

    const data = {
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
      merchantName,
      companyName,
      operatorName: existing?.operatorName ?? "",
      managerName: existing?.managerName ?? "",
      salesUserId: salesUser?.id ?? existing?.salesUserId ?? null,
      managerUserId: managerUser?.id ?? existing?.managerUserId ?? null,
      importBatchId,
    };

    await db.xlvDeviceRecord.update({
      where: { deviceSn: row.deviceSn },
      data,
    });
    if (hadMetrics) updatedDevices++;
    else createdDevices++;
  }

  return {
    snapshotRows: snapshots.length,
    createdDevices,
    updatedDevices,
    snapshotStats,
    fileDuplicateRowsCollapsed: Math.max(0, rows.length - dedupedSnapshots.length),
    uniqueDevices: allSns.size,
    statDateRange: statDateRangeFromRows(rows),
  };
}

async function importPersonnelRows(
  rows: ParsedXlvPersonnelRow[],
  importBatchId: string,
  indexes: Awaited<ReturnType<typeof buildUserLookupIndexes>>
) {
  let createdDevices = 0;
  let updatedDevices = 0;
  const unmatchedManagers = new Set<string>();
  const unmatchedOperators = new Set<string>();

  for (const row of rows) {
    const managerUser = findManagerInIndexes(indexes, row.managerName);
    const salesUser = findN7SalesInIndexes(
      indexes,
      row.operatorName,
      managerUser
    );

    if (row.managerName && !managerUser) {
      unmatchedManagers.add(row.managerName);
    }
    if (row.operatorName && !salesUser) {
      unmatchedOperators.add(row.operatorName);
    }

    const existing = await db.xlvDeviceRecord.findUnique({
      where: { deviceSn: row.deviceSn },
    });

    const data = {
      operatorName: row.operatorName,
      managerName: row.managerName,
      companyName: row.companyName,
      merchantName: row.merchantName,
      salesUserId: salesUser?.id ?? null,
      managerUserId: managerUser?.id ?? null,
      statDate: row.statDate ?? existing?.statDate ?? null,
      cumulativeUsers: row.cumulativeUsers || existing?.cumulativeUsers || 0,
      cumulativeTxns: row.cumulativeTxns || existing?.cumulativeTxns || 0,
      cumulativeAmount: row.cumulativeAmount || existing?.cumulativeAmount || 0,
      lastTxnDate: row.lastTxnDate ?? existing?.lastTxnDate ?? null,
      sleepDays: row.sleepDays || existing?.sleepDays || 0,
      isActivated: row.isActivated,
      firstTxnDate: row.firstTxnDate ?? existing?.firstTxnDate ?? null,
      importBatchId,
    };

    if (existing) {
      await db.xlvDeviceRecord.update({
        where: { deviceSn: row.deviceSn },
        data,
      });
      updatedDevices++;
    } else {
      await db.xlvDeviceRecord.create({
        data: {
          id: createId(),
          deviceSn: row.deviceSn,
          ...data,
        },
      });
      createdDevices++;
    }
  }

  return {
    snapshotRows: 0,
    createdDevices,
    updatedDevices,
    unmatchedManagers: [...unmatchedManagers].sort(),
    unmatchedOperators: [...unmatchedOperators].sort(),
    uniqueDevices: new Set(rows.map((r) => r.deviceSn)).size,
  };
}

export async function importXlvExcelFile(
  buffer: Buffer,
  fileName: string,
  uploadedById: string
): Promise<XlvImportResult> {
  const parsed = parseXlvExcelBuffer(buffer);
  if (parsed.errors.length && parsed.rows.length === 0) {
    return {
      format: parsed.format,
      totalRows: 0,
      importedRows: 0,
      snapshotRows: 0,
      createdDevices: 0,
      updatedDevices: 0,
      skippedRows: 0,
      sheetName: parsed.sheetName,
      status: "FAILED",
      errors: parsed.errors,
    };
  }

  const importLog = await db.importLog.create({
    data: {
      fileName,
      uploadedById,
      status: "PROCESSING",
      totalRows: parsed.rows.length,
    },
  });

  const indexes = await buildUserLookupIndexes();
  const rawRows = parsed.rows.filter((r) => r.format === "raw") as ParsedXlvRawRow[];
  const personnelRows = parsed.rows.filter(
    (r) => r.format === "personnel"
  ) as ParsedXlvPersonnelRow[];

  let snapshotRows = 0;
  let createdDevices = 0;
  let updatedDevices = 0;
  let importSummary: Partial<XlvImportSummary> = {};

  if (parsed.format === "raw") {
    const result = await importRawRows(rawRows, importLog.id, indexes);
    snapshotRows = result.snapshotRows;
    createdDevices = result.createdDevices;
    updatedDevices = result.updatedDevices;
    importSummary = {
      statDateRange: result.statDateRange,
      uniqueDevices: result.uniqueDevices,
      snapshotsWritten: result.snapshotRows,
      snapshotsCreated: result.snapshotStats.created,
      snapshotsUpdated: result.snapshotStats.updated,
      duplicateSnapshotsRemoved: result.snapshotStats.duplicatesRemoved,
      fileDuplicateRowsCollapsed: result.fileDuplicateRowsCollapsed,
      unmatchedManagers: [],
      unmatchedOperators: [],
    };
  } else {
    const result = await importPersonnelRows(
      personnelRows,
      importLog.id,
      indexes
    );
    createdDevices = result.createdDevices;
    updatedDevices = result.updatedDevices;
    importSummary = {
      uniqueDevices: result.uniqueDevices,
      snapshotsWritten: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      duplicateSnapshotsRemoved: 0,
      fileDuplicateRowsCollapsed: 0,
      unmatchedManagers: result.unmatchedManagers,
      unmatchedOperators: result.unmatchedOperators,
    };
  }

  const importedRows = createdDevices + updatedDevices;
  const status =
    parsed.errors.length > 0 ? "PARTIAL" : ("SUCCESS" as const);

  const summary: XlvImportSummary = {
    format: parsed.format,
    sheetName: parsed.sheetName,
    columns: parsed.meta?.columns ?? [],
    rawRowsInFile: parsed.rows.length,
    uniqueDevices: importSummary.uniqueDevices ?? 0,
    statDateRange: importSummary.statDateRange,
    snapshotsWritten: importSummary.snapshotsWritten ?? 0,
    snapshotsCreated: importSummary.snapshotsCreated ?? 0,
    snapshotsUpdated: importSummary.snapshotsUpdated ?? 0,
    fileDuplicateRowsCollapsed: importSummary.fileDuplicateRowsCollapsed ?? 0,
    duplicateSnapshotsRemoved: importSummary.duplicateSnapshotsRemoved ?? 0,
    devicesCreated: createdDevices,
    devicesUpdated: updatedDevices,
    unmatchedManagers: importSummary.unmatchedManagers ?? [],
    unmatchedOperators: importSummary.unmatchedOperators ?? [],
    warnings: parsed.errors,
  };

  await db.importLog.update({
    where: { id: importLog.id },
    data: {
      status: status === "SUCCESS" ? "SUCCESS" : "PARTIAL",
      importedRows,
      completedAt: new Date(),
    },
  });

  return {
    importLogId: importLog.id,
    format: parsed.format,
    totalRows: parsed.rows.length,
    importedRows,
    snapshotRows,
    createdDevices,
    updatedDevices,
    skippedRows: parsed.rows.length - importedRows,
    sheetName: parsed.sheetName,
    status,
    errors: parsed.errors,
    summary,
  };
}
