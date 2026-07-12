import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseExcelBuffer, type ParsedMerchantRow } from "@/services/import/excel-parser";
import { pruneMerchantsOutsideRetention } from "@/services/import/merchant-retention";
import {
  buildUserLookupIndexes,
  findUserInIndexes,
} from "@/services/org/user-matcher";

export interface ImportResult {
  importLogId?: string;
  totalRows: number;
  /** 新增 + 更新 */
  importedRows: number;
  createdRows: number;
  updatedRows: number;
  prunedRows: number;
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

async function loadExistingMerchantsByJobNumber(): Promise<Map<string, { id: string }>> {
  const existing = await db.merchantRecord.findMany({
    select: { id: true, jobNumber: true },
  });
  return new Map(existing.map((e) => [e.jobNumber, { id: e.id }]));
}

function buildMutableFields(
  row: ParsedMerchantRow,
  opportunityId: string | undefined,
  importLogId: string | undefined
): Prisma.MerchantRecordUpdateInput {
  return {
    merchantPid: row.merchantPid,
    merchantName: row.merchantName,
    opportunity: opportunityId ? { connect: { id: opportunityId } } : { disconnect: true },
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
    ...(importLogId ? { importBatch: { connect: { id: importLogId } } } : {}),
  };
}

export async function importParsedRows(
  rows: ParsedMerchantRow[],
  options: {
    fileName: string;
    uploadedById?: string;
    parseErrors?: string[];
    silentAlerts?: boolean;
    autoPrune?: boolean;
  }
): Promise<ImportResult> {
  const {
    fileName,
    uploadedById,
    parseErrors = [],
    silentAlerts = false,
    autoPrune = true,
  } = options;

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
  const existingByJob = await loadExistingMerchantsByJobNumber();
  const oppCache = new Map<string, string>();
  const seenInBatch = new Set<string>();

  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let anomalyRows = 0;
  const errors = [...parseErrors];
  const merchantCreates: Prisma.MerchantRecordCreateManyInput[] = [];
  const updateTasks: { id: string; data: Prisma.MerchantRecordUpdateInput }[] = [];
  const anomalyCreates: Prisma.AnomalyRecordCreateManyInput[] = [];

  for (const row of rows) {
    if (seenInBatch.has(row.jobNumber)) {
      skippedRows++;
      continue;
    }
    seenInBatch.add(row.jobNumber);

    const existing = existingByJob.get(row.jobNumber);

    if (existing) {
      let opportunityId: string | undefined;
      if (row.opportunityName) {
        opportunityId = await upsertOpportunityCache(oppCache, row.opportunityName);
      }
      updateTasks.push({
        id: existing.id,
        data: buildMutableFields(row, opportunityId, importLogId),
      });
      updatedRows++;
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

    existingByJob.set(row.jobNumber, { id: `pending-${row.jobNumber}` });
    createdRows++;
  }

  const CHUNK = 500;
  for (let i = 0; i < merchantCreates.length; i += CHUNK) {
    await db.merchantRecord.createMany({
      data: merchantCreates.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  for (let i = 0; i < updateTasks.length; i += CHUNK) {
    const slice = updateTasks.slice(i, i + CHUNK);
    await db.$transaction(
      slice.map(({ id, data }) => db.merchantRecord.update({ where: { id }, data }))
    );
  }

  for (let i = 0; i < anomalyCreates.length; i += CHUNK) {
    await db.anomalyRecord.createMany({
      data: anomalyCreates.slice(i, i + CHUNK),
    });
  }

  let prunedRows = 0;
  if (autoPrune) {
    prunedRows = await pruneMerchantsOutsideRetention();
  }

  const importedRows = createdRows + updatedRows;

  if (anomalyRows > 0 && !silentAlerts) {
    await db.systemAlert.create({
      data: {
        level: "warning",
        message: `导入 ${fileName}：${anomalyRows} 条未匹配，已归档`,
        source: "import",
      },
    });
  }

  const status =
    importedRows === 0 && rows.length > 0 && anomalyRows === rows.length
      ? "FAILED"
      : errors.length > 0 || anomalyRows > 0
        ? "PARTIAL"
        : "SUCCESS";

  const summaryLine = `新增 ${createdRows}，更新 ${updatedRows}，删除 ${prunedRows}，未匹配 ${anomalyRows}`;

  if (importLogId) {
    await db.importLog.update({
      where: { id: importLogId },
      data: {
        status,
        importedRows,
        skippedRows,
        anomalyRows,
        errorMessage:
          errors.length > 0 ? `${summaryLine}\n${errors.slice(0, 15).join("\n")}` : summaryLine,
        completedAt: new Date(),
      },
    });
  }

  return {
    importLogId,
    totalRows: rows.length,
    importedRows,
    createdRows,
    updatedRows,
    prunedRows,
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
