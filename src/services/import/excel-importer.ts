import { Prisma } from "@/generated/prisma/client";
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

type MerchantUpdateRow = {
  id: string;
  merchantPid: string | null;
  merchantName: string;
  merchantType: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  photoStatus: string;
  riskStatus: string;
  salesActivationStatus: string;
  riskFailReason: string | null;
  expandDate: Date;
  touchCount15d: number;
  scanCount15d: number;
  transactionCount30d: number;
  importBatchId: string | null;
};

function buildUpdateRow(
  id: string,
  row: ParsedMerchantRow,
  opportunityId: string | undefined,
  importLogId: string | undefined
): MerchantUpdateRow {
  return {
    id,
    merchantPid: row.merchantPid ?? null,
    merchantName: row.merchantName,
    merchantType: row.merchantType ?? null,
    opportunityId: opportunityId ?? null,
    opportunityName: row.opportunityName ?? null,
    photoStatus: row.photoStatus,
    riskStatus: row.riskStatus,
    salesActivationStatus: row.salesActivationStatus,
    riskFailReason: row.riskFailReason ?? null,
    expandDate: row.expandDate,
    touchCount15d: row.touchCount15d,
    scanCount15d: row.scanCount15d,
    transactionCount30d: row.transactionCount30d,
    importBatchId: importLogId ?? null,
  };
}

/** 单条 UPDATE 会打爆 Prisma Dev 连接池；改为按块 VALUES 批量更新 */
async function runBulkUpdates(rows: MerchantUpdateRow[]) {
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.$executeRaw`
      UPDATE "MerchantRecord" AS m
      SET
        "merchantPid" = NULLIF(v."merchantPid", '')::text,
        "merchantName" = v."merchantName"::text,
        -- 表格缺列/空值时保留原商户类型，避免无该列的旧文件回写把 A/B/C 清掉
        "merchantType" = COALESCE(NULLIF(v."merchantType", '')::text, m."merchantType"),
        "opportunityId" = NULLIF(v."opportunityId", '')::text,
        "opportunityName" = NULLIF(v."opportunityName", '')::text,
        "photoStatus" = v."photoStatus"::"PhotoStatus",
        "riskStatus" = v."riskStatus"::"RiskStatus",
        "salesActivationStatus" = v."salesActivationStatus"::"SalesActivationStatus",
        "riskFailReason" = NULLIF(v."riskFailReason", '')::text,
        "expandDate" = v."expandDate"::timestamp,
        "touchCount15d" = v."touchCount15d"::integer,
        "scanCount15d" = v."scanCount15d"::integer,
        "transactionCount30d" = v."transactionCount30d"::integer,
        "sourceMode" = 'MANUAL_UPLOAD'::"DataMode",
        "importBatchId" = NULLIF(v."importBatchId", '')::text,
        "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(
        chunk.map(
          (r) =>
            Prisma.sql`(
              ${r.id},
              ${r.merchantPid ?? ""},
              ${r.merchantName},
              ${r.merchantType ?? ""},
              ${r.opportunityId ?? ""},
              ${r.opportunityName ?? ""},
              ${r.photoStatus},
              ${r.riskStatus},
              ${r.salesActivationStatus},
              ${r.riskFailReason ?? ""},
              ${r.expandDate.toISOString()},
              ${r.touchCount15d},
              ${r.scanCount15d},
              ${r.transactionCount30d},
              ${r.importBatchId ?? ""}
            )`
        )
      )}) AS v(
        id, "merchantPid", "merchantName", "merchantType", "opportunityId", "opportunityName",
        "photoStatus", "riskStatus", "salesActivationStatus", "riskFailReason",
        "expandDate", "touchCount15d", "scanCount15d", "transactionCount30d", "importBatchId"
      )
      WHERE m.id = v.id
    `;
  }
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

  const uniqueOppNames = [
    ...new Set(
      rows
        .map((row) => row.opportunityName?.trim())
        .filter((name): name is string => Boolean(name))
    ),
  ];
  for (const name of uniqueOppNames) {
    await upsertOpportunityCache(oppCache, name);
  }

  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let anomalyRows = 0;
  const errors = [...parseErrors];
  const merchantCreates: Prisma.MerchantRecordCreateManyInput[] = [];
  const updateRows: MerchantUpdateRow[] = [];
  const anomalyCreates: Prisma.AnomalyRecordCreateManyInput[] = [];

  for (const row of rows) {
    if (seenInBatch.has(row.jobNumber)) {
      skippedRows++;
      continue;
    }
    seenInBatch.add(row.jobNumber);

    const existing = existingByJob.get(row.jobNumber);
    const opportunityId = row.opportunityName
      ? oppCache.get(row.opportunityName)
      : undefined;

    if (existing) {
      if (existing.id.startsWith("pending-")) continue;
      updateRows.push(buildUpdateRow(existing.id, row, opportunityId, importLogId));
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

    merchantCreates.push({
      jobNumber: row.jobNumber,
      merchantPid: row.merchantPid,
      merchantName: row.merchantName,
      merchantType: row.merchantType,
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

  const CREATE_CHUNK = 200;

  for (let i = 0; i < merchantCreates.length; i += CREATE_CHUNK) {
    await db.merchantRecord.createMany({
      data: merchantCreates.slice(i, i + CREATE_CHUNK),
      skipDuplicates: true,
    });
  }

  await runBulkUpdates(updateRows);

  for (let i = 0; i < anomalyCreates.length; i += CREATE_CHUNK) {
    await db.anomalyRecord.createMany({
      data: anomalyCreates.slice(i, i + CREATE_CHUNK),
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
