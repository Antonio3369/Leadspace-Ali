import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseExcelBuffer, type ParsedMerchantRow } from "@/services/import/excel-parser";
import {
  buildUserLookupIndexes,
  findUserInIndexes,
} from "@/services/org/user-matcher";

export interface ImportResult {
  importLogId?: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  anomalyRows: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errors: string[];
}

async function upsertOpportunityCache(
  cache: Map<string, string>,
  name: string
): Promise<string> {
  if (cache.has(name)) return cache.get(name)!;
  const opp = await db.opportunity.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  cache.set(name, opp.id);
  return opp.id;
}

async function loadExistingJobNumbers(): Promise<Set<string>> {
  const existing = await db.merchantRecord.findMany({
    select: { jobNumber: true },
  });
  return new Set(existing.map((e) => e.jobNumber));
}

export async function importParsedRows(
  rows: ParsedMerchantRow[],
  options: {
    fileName: string;
    uploadedById?: string;
    parseErrors?: string[];
    silentAlerts?: boolean;
  }
): Promise<ImportResult> {
  const { fileName, uploadedById, parseErrors = [], silentAlerts = false } = options;

  let importLogId: string | undefined;
  if (uploadedById) {
    const log = await db.importLog.create({
      data: {
        fileName,
        uploadedById,
        status: "PROCESSING",
        totalRows: rows.length,
      },
    });
    importLogId = log.id;
  }

  const userIndexes = await buildUserLookupIndexes();
  const jobNumbers = await loadExistingJobNumbers();
  const oppCache = new Map<string, string>();
  const seenInBatch = new Set<string>();

  let importedRows = 0;
  let skippedRows = 0;
  let anomalyRows = 0;
  const errors = [...parseErrors];
  const merchantCreates: Prisma.MerchantRecordCreateManyInput[] = [];
  const anomalyCreates: Prisma.AnomalyRecordCreateManyInput[] = [];

  for (const row of rows) {
    const dedupeKey = row.jobNumber;
    if (jobNumbers.has(row.jobNumber) || seenInBatch.has(dedupeKey)) {
      skippedRows++;
      if (importLogId) {
        anomalyCreates.push({
          type: "DUPLICATE",
          rawData: row.rawRow as Prisma.InputJsonValue,
          salesUserName: row.salesUserName,
          jobNumber: row.jobNumber,
          merchantPid: row.merchantPid,
          reason: `重复数据已跳过：作业编号 ${row.jobNumber}`,
          importBatchId: importLogId,
        });
      }
      continue;
    }

    const matchedUser = findUserInIndexes(
      userIndexes,
      row.salesUserName,
      row.salesEmployeePid
    );
    if (!matchedUser) {
      anomalyRows++;
      if (importLogId) {
        const pidHint = row.salesEmployeePid ? `，员工id ${row.salesEmployeePid}` : "";
        anomalyCreates.push({
          type: "NAME_MISMATCH",
          rawData: row.rawRow as Prisma.InputJsonValue,
          salesUserName: row.salesUserName,
          jobNumber: row.jobNumber,
          merchantPid: row.merchantPid,
          reason: `P 站姓名「${row.salesUserName}」${pidHint} 与后台人员不匹配`,
          importBatchId: importLogId,
        });
      }
      continue;
    }

    let opportunityId: string | undefined;
    if (row.opportunityName) {
      opportunityId = await upsertOpportunityCache(oppCache, row.opportunityName);
    }

    merchantCreates.push({
      jobNumber: row.jobNumber,
      merchantPid: row.merchantPid,
      merchantName: row.merchantName,
      salesUserId: matchedUser.id,
      salesUserName: row.salesUserName,
      teamId: matchedUser.teamId,
      opportunityId,
      opportunityName: row.opportunityName,
      photoStatus: row.photoStatus,
      riskStatus: row.riskStatus,
      salesActivationStatus: row.salesActivationStatus,
      riskFailReason: row.riskFailReason,
      expandDate: row.expandDate,
      touchCount15d: row.touchCount15d,
      scanCount15d: row.scanCount15d,
      transactionCount30d: row.transactionCount30d,
      sourceMode: "MANUAL_UPLOAD",
      importBatchId: importLogId,
    });

    seenInBatch.add(dedupeKey);
    jobNumbers.add(row.jobNumber);
    importedRows++;
  }

  const CHUNK = 500;
  for (let i = 0; i < merchantCreates.length; i += CHUNK) {
    await db.merchantRecord.createMany({
      data: merchantCreates.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  for (let i = 0; i < anomalyCreates.length; i += CHUNK) {
    await db.anomalyRecord.createMany({
      data: anomalyCreates.slice(i, i + CHUNK),
    });
  }

  if (anomalyRows > 0 && !silentAlerts) {
    await db.systemAlert.create({
      data: {
        level: "warning",
        message: `导入 ${fileName}：${anomalyRows} 条姓名未匹配，已归档`,
        source: "import",
      },
    });
  }

  const status =
    importedRows === 0 && rows.length > 0
      ? "FAILED"
      : errors.length > 0 || anomalyRows > 0 || skippedRows > 0
        ? "PARTIAL"
        : "SUCCESS";

  if (importLogId) {
    await db.importLog.update({
      where: { id: importLogId },
      data: {
        status,
        importedRows,
        skippedRows,
        anomalyRows,
        errorMessage: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
        completedAt: new Date(),
      },
    });
  }

  return {
    importLogId,
    totalRows: rows.length,
    importedRows,
    skippedRows,
    anomalyRows,
    status,
    errors,
  };
}

export async function importExcelFile(
  buffer: Buffer,
  fileName: string,
  uploadedById: string
): Promise<ImportResult> {
  const config = await db.systemConfig.findUnique({ where: { id: "singleton" } });
  if (config?.dataMode === "API_SYNC") {
    throw new Error("当前为 API 自动拉取模式，Excel 上传入口已关闭");
  }

  const { rows, errors: parseErrors } = parseExcelBuffer(buffer);
  return importParsedRows(rows, {
    fileName,
    uploadedById,
    parseErrors: parseErrors.map((e) => `第 ${e.rowIndex} 行：${e.reason}`),
  });
}

export async function importExcelFromPath(
  filePath: string,
  uploadedById: string,
  silentAlerts = true
): Promise<ImportResult> {
  const fs = await import("fs");
  const buffer = fs.readFileSync(filePath);
  const fileName = filePath.split("/").pop() ?? filePath;
  const { rows, errors: parseErrors } = parseExcelBuffer(buffer);
  return importParsedRows(rows, {
    fileName,
    uploadedById,
    parseErrors: parseErrors.map((e) => `第 ${e.rowIndex} 行：${e.reason}`),
    silentAlerts,
  });
}
