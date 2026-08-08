import { randomBytes } from "crypto";
import fs from "fs";
import { db } from "@/lib/db";
import {
  parseXlvExcelBuffer,
  type ParsedXlvAssignmentRow,
  type ParsedXlvRawRow,
  type ParsedXlvRosterRow,
} from "@/services/import/xlv-excel-parser";
import {
  isXlvManagerSelfSale,
  isXlvPlaceholderName,
  xlvRosterPairKey,
} from "@/lib/xlv-rules";
import { enrichXlvSnapshotDailyMetrics } from "@/services/xlv/snapshot-daily";
import { normalizeXlvStatDate, xlvStatDateKey } from "@/lib/xlv-stat-date";
import type { XlvImportFormat, XlvImportSummary } from "@/services/import/xlv-import-summary";
import {
  buildXlvRosterIndex,
  buildXlvRosterPairSet,
  loadXlvRosterEntries,
  resolveXlvManagerFromRoster,
} from "@/services/xlv/roster";
import { provisionXlvAccountsFromRoster } from "@/services/xlv/member-accounts";
import {
  bulkUpdateDevicesFromRaw,
  upsertSnapshotsBulk,
  type SnapshotWrite,
  type XlvImportProgress,
} from "@/services/import/xlv-raw-bulk";

function createId() {
  return `c${randomBytes(12).toString("hex")}`;
}

export interface XlvImportResult {
  importLogId?: string;
  format: XlvImportFormat;
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
  onProgress?: XlvImportProgress
) {
  await onProgress?.(18, `整理 ${rows.length.toLocaleString()} 行数据…`);

  const dedupedSnapshots = uniqueSnapshots(rows);
  const snapshotRowCount = dedupedSnapshots.length;
  await onProgress?.(
    19,
    `去重后 ${snapshotRowCount.toLocaleString()} 条快照，按设备分批写入…`
  );

  const latestBySn = pickLatestRawBySn(rows);
  const statDateRange = statDateRangeFromRows(rows);
  const fileDuplicateRowsCollapsed = Math.max(
    0,
    rows.length - dedupedSnapshots.length
  );

  const byDevice = new Map<string, SnapshotWrite[]>();
  for (const snap of dedupedSnapshots) {
    const list = byDevice.get(snap.deviceSn) ?? [];
    list.push(snap);
    byDevice.set(snap.deviceSn, list);
  }
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.statDate.getTime() - b.statDate.getTime());
  }

  const allSns = new Set([...byDevice.keys(), ...latestBySn.keys()]);

  await onProgress?.(20, `确保设备记录 ${allSns.size.toLocaleString()} 台…`);
  const CREATE_CHUNK = 500;
  const snsList = [...allSns];
  for (let i = 0; i < snsList.length; i += CREATE_CHUNK) {
    await db.xlvDeviceRecord.createMany({
      data: snsList.slice(i, i + CREATE_CHUNK).map((deviceSn) => ({
        id: createId(),
        deviceSn,
      })),
      skipDuplicates: true,
    });
  }

  const deviceSns = [...byDevice.keys()].sort();
  const snapshotStats = {
    created: 0,
    updated: 0,
    duplicatesRemoved: 0,
  };
  let writeBatch: SnapshotWrite[] = [];

  const flushWriteBatch = async () => {
    if (writeBatch.length === 0) return;
    const stats = await upsertSnapshotsBulk(
      writeBatch,
      importBatchId,
      onProgress
    );
    snapshotStats.created += stats.created;
    snapshotStats.updated += stats.updated;
    snapshotStats.duplicatesRemoved += stats.duplicatesRemoved;
    writeBatch = [];
  };

  for (let i = 0; i < deviceSns.length; i++) {
    const deviceSn = deviceSns[i]!;
    const deviceSnaps = byDevice.get(deviceSn) ?? [];
    const enriched = enrichXlvSnapshotDailyMetrics(
      deviceSnaps.map((snap) => ({ ...snap, importBatchId }))
    );
    writeBatch.push(...enriched);

    if (writeBatch.length >= 500) {
      await flushWriteBatch();
    }

    if (i > 0 && i % 80 === 0) {
      const pct = 20 + Math.round((i / deviceSns.length) * 55);
      await onProgress?.(
        pct,
        `写入快照 ${i.toLocaleString()} / ${deviceSns.length.toLocaleString()} 台…`
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  await flushWriteBatch();

  const { createdDevices, updatedDevices } = await bulkUpdateDevicesFromRaw(
    latestBySn,
    importBatchId,
    onProgress
  );

  return {
    snapshotRows: snapshotRowCount,
    createdDevices,
    updatedDevices,
    snapshotStats,
    fileDuplicateRowsCollapsed,
    uniqueDevices: allSns.size,
    statDateRange,
  };
}

async function writeRosterRow(row: ParsedXlvRosterRow) {
  const existing = await db.xlvTeamRoster.findFirst({
    where: {
      operatorName: row.operatorName,
      managerName: row.managerName,
    },
    select: { id: true },
  });

  if (existing) {
    await db.xlvTeamRoster.update({
      where: { id: existing.id },
      data: { companyName: row.companyName },
    });
    return "updated" as const;
  }

  await db.xlvTeamRoster.create({
    data: {
      id: createId(),
      operatorName: row.operatorName,
      managerName: row.managerName,
      companyName: row.companyName,
    },
  });
  return "created" as const;
}

async function importRosterRows(rows: ParsedXlvRosterRow[], _importBatchId: string) {
  let created = 0;
  let updated = 0;
  const seenOperators = new Set<string>();

  for (const row of rows) {
    seenOperators.add(row.operatorName);
    const outcome = await writeRosterRow(row);
    if (outcome === "created") created += 1;
    else updated += 1;
  }

  const accountStats = await provisionXlvAccountsFromRoster(rows);

  return {
    snapshotRows: 0,
    createdDevices: 0,
    updatedDevices: 0,
    rosterRowsWritten: rows.length,
    rosterCreated: created,
    rosterUpdated: updated,
    uniqueOperators: seenOperators.size,
    accountsCreated: accountStats.created,
    accountsUpdated: accountStats.updated,
    devicesBackfilledFromRoster: 0,
    managersInferredFromRoster: 0,
    unmatchedManagers: [] as string[],
    unmatchedOperators: [] as string[],
    uniqueDevices: 0,
  };
}

async function importAssignmentRows(
  rows: ParsedXlvAssignmentRow[],
  importBatchId: string
) {
  let createdDevices = 0;
  let updatedDevices = 0;
  let managersInferredFromRoster = 0;
  const unmatchedOperators = new Set<string>();
  const rosterEntries = await loadXlvRosterEntries();
  const rosterByOperator = buildXlvRosterIndex(rosterEntries);
  const rosterPairs = buildXlvRosterPairSet(rosterEntries);
  const snapshotsToWrite: SnapshotWrite[] = [];

  for (const row of rows) {
    let managerName = row.managerName.trim();
    let companyName = row.companyName;

    if (!managerName && row.operatorName.trim()) {
      const resolved = resolveXlvManagerFromRoster(
        rosterByOperator,
        row.operatorName,
        null
      );
      if (resolved && !resolved.ambiguous && resolved.managerName) {
        managerName = resolved.managerName;
        companyName = companyName ?? resolved.companyName;
        managersInferredFromRoster += 1;
      }
    }

    const operatorName = row.operatorName.trim();
    if (
      rosterPairs.size > 0 &&
      operatorName &&
      !isXlvPlaceholderName(operatorName) &&
      !isXlvManagerSelfSale({ operatorName, managerName })
    ) {
      if (!rosterPairs.has(xlvRosterPairKey(managerName, operatorName))) {
        unmatchedOperators.add(operatorName);
      }
    }

    const existing = await db.xlvDeviceRecord.findUnique({
      where: { deviceSn: row.deviceSn },
    });

    const data = {
      operatorName: row.operatorName,
      managerName,
      companyName,
      merchantName: row.merchantName,
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

    if (row.statDate) {
      snapshotsToWrite.push({
        deviceSn: row.deviceSn,
        statDate: normalizeXlvStatDate(row.statDate),
        cumulativeUsers: row.cumulativeUsers,
        cumulativeTxns: row.cumulativeTxns,
        cumulativeAmount: row.cumulativeAmount,
        lastTxnDate: row.lastTxnDate,
        sleepDays: row.sleepDays,
        isActivated: row.isActivated,
        firstTxnDate: row.firstTxnDate,
        dailyUsers: 0,
        dailyTxns: 0,
        dailyAmount: 0,
        importBatchId,
      });
    }
  }

  let snapshotRows = 0;
  if (snapshotsToWrite.length > 0) {
    await upsertSnapshotsBulk(snapshotsToWrite, importBatchId);
    snapshotRows = snapshotsToWrite.length;
  }

  return {
    snapshotRows,
    createdDevices,
    updatedDevices,
    rosterRowsWritten: 0,
    rosterCreated: 0,
    rosterUpdated: 0,
    uniqueOperators: 0,
    devicesBackfilledFromRoster: 0,
    managersInferredFromRoster,
    unmatchedManagers: [],
    unmatchedOperators: [...unmatchedOperators].sort(),
    uniqueDevices: new Set(rows.map((r) => r.deviceSn)).size,
  };
}

export async function importXlvExcelFile(
  buffer: Buffer,
  fileName: string,
  uploadedById: string,
  opts?: { onProgress?: XlvImportProgress }
): Promise<XlvImportResult> {
  return importXlvExcelBuffer(buffer, fileName, uploadedById, opts);
}

export async function importXlvExcelFileFromPath(
  filePath: string,
  fileName: string,
  uploadedById: string,
  opts?: { onProgress?: XlvImportProgress }
): Promise<XlvImportResult> {
  const buffer = fs.readFileSync(filePath);
  try {
    return await importXlvExcelBuffer(buffer, fileName, uploadedById, opts);
  } finally {
    // 解析后释放文件缓冲引用，降低大表导入峰值内存
  }
}

async function importXlvExcelBuffer(
  buffer: Buffer,
  fileName: string,
  uploadedById: string,
  opts?: { onProgress?: XlvImportProgress }
): Promise<XlvImportResult> {
  const onProgress = opts?.onProgress;
  await onProgress?.(16, "正在解析 Excel…");

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

  const rawRows = parsed.rows.filter((r) => r.format === "raw") as ParsedXlvRawRow[];
  const rosterRows = parsed.rows.filter((r) => r.format === "roster") as ParsedXlvRosterRow[];
  const assignmentRows = parsed.rows.filter(
    (r) => r.format === "assignment"
  ) as ParsedXlvAssignmentRow[];

  let snapshotRows = 0;
  let createdDevices = 0;
  let updatedDevices = 0;
  let importSummary: Partial<XlvImportSummary> = {};

  if (parsed.format === "raw") {
    const result = await importRawRows(rawRows, importLog.id, onProgress);
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
      rosterRowsWritten: 0,
      rosterCreated: 0,
      rosterUpdated: 0,
      uniqueOperators: 0,
      devicesBackfilledFromRoster: 0,
      managersInferredFromRoster: 0,
      unmatchedManagers: [],
      unmatchedOperators: [],
    };
  } else if (parsed.format === "roster") {
    const result = await importRosterRows(rosterRows, importLog.id);
    const rosterHint =
      "名册已写入。设备经理/公司回填请前往「人员归属核对」点击「从名册同步」。";
    if (!parsed.errors.includes(rosterHint)) {
      parsed.errors.push(rosterHint);
    }
    importSummary = {
      uniqueDevices: 0,
      snapshotsWritten: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      duplicateSnapshotsRemoved: 0,
      fileDuplicateRowsCollapsed: 0,
      rosterRowsWritten: result.rosterRowsWritten,
      rosterCreated: result.rosterCreated,
      rosterUpdated: result.rosterUpdated,
      uniqueOperators: result.uniqueOperators,
      devicesBackfilledFromRoster: result.devicesBackfilledFromRoster,
      managersInferredFromRoster: 0,
      unmatchedManagers: result.unmatchedManagers,
      unmatchedOperators: result.unmatchedOperators,
    };
  } else {
    const result = await importAssignmentRows(assignmentRows, importLog.id);
    createdDevices = result.createdDevices;
    updatedDevices = result.updatedDevices;
    snapshotRows = result.snapshotRows;
    importSummary = {
      uniqueDevices: result.uniqueDevices,
      snapshotsWritten: result.snapshotRows,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      duplicateSnapshotsRemoved: 0,
      fileDuplicateRowsCollapsed: 0,
      rosterRowsWritten: 0,
      rosterCreated: 0,
      rosterUpdated: 0,
      uniqueOperators: 0,
      devicesBackfilledFromRoster: 0,
      managersInferredFromRoster: result.managersInferredFromRoster,
      unmatchedManagers: result.unmatchedManagers,
      unmatchedOperators: result.unmatchedOperators,
    };
  }

  const importedRows =
    parsed.format === "roster"
      ? importSummary.rosterRowsWritten ?? 0
      : createdDevices + updatedDevices;
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
    rosterRowsWritten: importSummary.rosterRowsWritten ?? 0,
    rosterCreated: importSummary.rosterCreated ?? 0,
    rosterUpdated: importSummary.rosterUpdated ?? 0,
    uniqueOperators: importSummary.uniqueOperators ?? 0,
    accountsCreated: importSummary.accountsCreated ?? 0,
    accountsUpdated: importSummary.accountsUpdated ?? 0,
    devicesBackfilledFromRoster: importSummary.devicesBackfilledFromRoster ?? 0,
    managersInferredFromRoster: importSummary.managersInferredFromRoster ?? 0,
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
