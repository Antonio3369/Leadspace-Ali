import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

function createId() {
  return `c${randomBytes(12).toString("hex")}`;
}
import {
  parseN7ExcelBuffer,
  type ParsedN7DeviceRow,
} from "@/services/import/n7-excel-parser";
import {
  buildUserLookupIndexes,
  findManagerInIndexes,
  findUserInIndexes,
  type UserLookupIndexes,
} from "@/services/org/user-matcher";

export interface N7ImportResult {
  importLogId?: string;
  totalRows: number;
  importedRows: number;
  createdRows: number;
  updatedRows: number;
  deletedRows: number;
  skippedRows: number;
  anomalyRows: number;
  sheetName?: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errors: string[];
}

type N7WriteRow = {
  id: string;
  deviceSn: string;
  registeredAt: Date | null;
  litAt: Date | null;
  subscribedAt: Date | null;
  firstCheckInAt: Date | null;
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
  assessmentStartAt: Date | null;
  assessmentEndAt: Date | null;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
  effectiveUsers: number;
  isQualified: boolean;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  phase2Days: number;
  phase2Users: number;
  storeId: string | null;
  storeName: string | null;
  storeAddress: string | null;
  storePhone: string | null;
  merchantId: string | null;
  merchantAccount: string | null;
  merchantPhone: string | null;
  salesUserId: string | null;
  managerUserId: string | null;
  importBatchId: string;
};

function toWriteRow(
  row: ParsedN7DeviceRow,
  indexes: UserLookupIndexes,
  importBatchId: string,
  existingId?: string
): N7WriteRow {
  const salesUser = findUserInIndexes(indexes, row.operatorName);
  const managerUser = findManagerInIndexes(indexes, row.managerName);
  return {
    id: existingId ?? createId(),
    deviceSn: row.deviceSn,
    registeredAt: row.registeredAt,
    litAt: row.litAt,
    subscribedAt: row.subscribedAt,
    firstCheckInAt: row.firstCheckInAt,
    notLit: row.notLit,
    notSubscribed: row.notSubscribed,
    notCheckedIn: row.notCheckedIn,
    assessmentStartAt: row.assessmentStartAt,
    assessmentEndAt: row.assessmentEndAt,
    remainingDays: row.remainingDays,
    remainingEnded: row.remainingEnded,
    effectiveDays: row.effectiveDays,
    effectiveUsers: row.effectiveUsers,
    isQualified: row.isQualified,
    operatorName: row.operatorName,
    managerName: row.managerName,
    companyName: row.companyName,
    phase2Days: row.phase2Days,
    phase2Users: row.phase2Users,
    storeId: row.storeId,
    storeName: row.storeName,
    storeAddress: row.storeAddress,
    storePhone: row.storePhone,
    merchantId: row.merchantId,
    merchantAccount: row.merchantAccount,
    merchantPhone: row.merchantPhone,
    salesUserId: salesUser?.id ?? null,
    managerUserId: managerUser?.id ?? null,
    importBatchId,
  };
}

async function bulkInsert(rows: N7WriteRow[]) {
  const CHUNK = 300;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db.n7DeviceRecord.createMany({
      data: slice.map((r) => ({
        id: r.id,
        deviceSn: r.deviceSn,
        registeredAt: r.registeredAt,
        litAt: r.litAt,
        subscribedAt: r.subscribedAt,
        firstCheckInAt: r.firstCheckInAt,
        notLit: r.notLit,
        notSubscribed: r.notSubscribed,
        notCheckedIn: r.notCheckedIn,
        assessmentStartAt: r.assessmentStartAt,
        assessmentEndAt: r.assessmentEndAt,
        remainingDays: r.remainingDays,
        remainingEnded: r.remainingEnded,
        effectiveDays: r.effectiveDays,
        effectiveUsers: r.effectiveUsers,
        isQualified: r.isQualified,
        operatorName: r.operatorName,
        managerName: r.managerName,
        companyName: r.companyName,
        phase2Days: r.phase2Days,
        phase2Users: r.phase2Users,
        storeId: r.storeId,
        storeName: r.storeName,
        storeAddress: r.storeAddress,
        storePhone: r.storePhone,
        merchantId: r.merchantId,
        merchantAccount: r.merchantAccount,
        merchantPhone: r.merchantPhone,
        salesUserId: r.salesUserId,
        managerUserId: r.managerUserId,
        sourceMode: "MANUAL_UPLOAD",
        importBatchId: r.importBatchId,
      })),
      skipDuplicates: true,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function bulkUpdate(rows: N7WriteRow[]) {
  const CHUNK = 150;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.$executeRaw`
      UPDATE "N7DeviceRecord" AS m
      SET
        "registeredAt" = NULLIF(v."registeredAt", '')::timestamptz,
        "litAt" = NULLIF(v."litAt", '')::timestamptz,
        "subscribedAt" = NULLIF(v."subscribedAt", '')::timestamptz,
        "firstCheckInAt" = NULLIF(v."firstCheckInAt", '')::timestamptz,
        "notLit" = v."notLit"::boolean,
        "notSubscribed" = v."notSubscribed"::boolean,
        "notCheckedIn" = v."notCheckedIn"::boolean,
        "assessmentStartAt" = NULLIF(v."assessmentStartAt", '')::timestamptz,
        "assessmentEndAt" = NULLIF(v."assessmentEndAt", '')::timestamptz,
        "remainingDays" = NULLIF(v."remainingDays", '')::integer,
        "remainingEnded" = v."remainingEnded"::boolean,
        "effectiveDays" = v."effectiveDays"::integer,
        "effectiveUsers" = v."effectiveUsers"::integer,
        "isQualified" = v."isQualified"::boolean,
        "operatorName" = v."operatorName"::text,
        "managerName" = v."managerName"::text,
        "companyName" = NULLIF(v."companyName", '')::text,
        "phase2Days" = v."phase2Days"::integer,
        "phase2Users" = v."phase2Users"::integer,
        "storeId" = NULLIF(v."storeId", '')::text,
        "storeName" = NULLIF(v."storeName", '')::text,
        "storeAddress" = NULLIF(v."storeAddress", '')::text,
        "storePhone" = NULLIF(v."storePhone", '')::text,
        "merchantId" = NULLIF(v."merchantId", '')::text,
        "merchantAccount" = NULLIF(v."merchantAccount", '')::text,
        "merchantPhone" = NULLIF(v."merchantPhone", '')::text,
        "salesUserId" = NULLIF(v."salesUserId", '')::text,
        "managerUserId" = NULLIF(v."managerUserId", '')::text,
        "sourceMode" = 'MANUAL_UPLOAD'::"DataMode",
        "importBatchId" = NULLIF(v."importBatchId", '')::text,
        "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(
        chunk.map(
          (r) =>
            Prisma.sql`(
              ${r.id},
              ${r.registeredAt?.toISOString() ?? ""},
              ${r.litAt?.toISOString() ?? ""},
              ${r.subscribedAt?.toISOString() ?? ""},
              ${r.firstCheckInAt?.toISOString() ?? ""},
              ${r.notLit},
              ${r.notSubscribed},
              ${r.notCheckedIn},
              ${r.assessmentStartAt?.toISOString() ?? ""},
              ${r.assessmentEndAt?.toISOString() ?? ""},
              ${r.remainingDays == null ? "" : String(r.remainingDays)},
              ${r.remainingEnded},
              ${r.effectiveDays},
              ${r.effectiveUsers},
              ${r.isQualified},
              ${r.operatorName},
              ${r.managerName},
              ${r.companyName ?? ""},
              ${r.phase2Days},
              ${r.phase2Users},
              ${r.storeId ?? ""},
              ${r.storeName ?? ""},
              ${r.storeAddress ?? ""},
              ${r.storePhone ?? ""},
              ${r.merchantId ?? ""},
              ${r.merchantAccount ?? ""},
              ${r.merchantPhone ?? ""},
              ${r.salesUserId ?? ""},
              ${r.managerUserId ?? ""},
              ${r.importBatchId}
            )`
        )
      )}) AS v(
        id, "registeredAt", "litAt", "subscribedAt", "firstCheckInAt",
        "notLit", "notSubscribed", "notCheckedIn",
        "assessmentStartAt", "assessmentEndAt", "remainingDays", "remainingEnded",
        "effectiveDays", "effectiveUsers", "isQualified",
        "operatorName", "managerName", "companyName",
        "phase2Days", "phase2Users",
        "storeId", "storeName", "storeAddress", "storePhone",
        "merchantId", "merchantAccount", "merchantPhone",
        "salesUserId", "managerUserId", "importBatchId"
      )
      WHERE m.id = v.id
    `;
  }
}

export async function importN7ExcelFile(
  buffer: Buffer,
  fileName: string,
  uploadedById: string
): Promise<N7ImportResult> {
  const {
    rows,
    errors: parseErrors,
    sheetName,
  } = parseN7ExcelBuffer(buffer);
  if (rows.length === 0) {
    return {
      totalRows: 0,
      importedRows: 0,
      createdRows: 0,
      updatedRows: 0,
      deletedRows: 0,
      skippedRows: parseErrors.length,
      anomalyRows: 0,
      sheetName,
      status: "FAILED",
      errors: parseErrors.length ? parseErrors : ["未解析到有效行"],
    };
  }

  const importLog = await db.importLog.create({
    data: {
      fileName: sheetName ? `${fileName} [${sheetName}]` : fileName,
      uploadedById,
      status: "PROCESSING",
      totalRows: rows.length,
    },
  });

  const indexes = await buildUserLookupIndexes();
  const existing = await db.n7DeviceRecord.findMany({
    select: { id: true, deviceSn: true },
  });
  const bySn = new Map(existing.map((e) => [e.deviceSn, e.id]));

  const creates: N7WriteRow[] = [];
  const updates: N7WriteRow[] = [];

  for (const row of rows) {
    const existingId = bySn.get(row.deviceSn);
    const write = toWriteRow(row, indexes, importLog.id, existingId);
    if (existingId) updates.push(write);
    else {
      creates.push(write);
      bySn.set(row.deviceSn, write.id);
    }
  }

  const errors = [...parseErrors];
  let anomalyRows = 0;
  let deletedRows = 0;

  try {
    await bulkInsert(creates);
    await bulkUpdate(updates);

    // 全量同步：名单中消失的设备自动清理
    const incomingSns = new Set(rows.map((r) => r.deviceSn));
    const staleIds = existing
      .filter((e) => !incomingSns.has(e.deviceSn))
      .map((e) => e.id);
    const DELETE_CHUNK = 500;
    for (let i = 0; i < staleIds.length; i += DELETE_CHUNK) {
      const { count } = await db.n7DeviceRecord.deleteMany({
        where: { id: { in: staleIds.slice(i, i + DELETE_CHUNK) } },
      });
      deletedRows += count;
    }
  } catch (err) {
    anomalyRows = rows.length;
    deletedRows = 0;
    errors.push(err instanceof Error ? err.message : "批量写入失败");
  }

  const createdRows = anomalyRows ? 0 : creates.length;
  const updatedRows = anomalyRows ? 0 : updates.length;
  const importedRows = createdRows + updatedRows;
  const status =
    importedRows === 0
      ? "FAILED"
      : errors.length > 0 || anomalyRows > 0
        ? "PARTIAL"
        : "SUCCESS";

  await db.importLog.update({
    where: { id: importLog.id },
    data: {
      status,
      importedRows,
      skippedRows: Math.max(0, rows.length - importedRows),
      anomalyRows,
      errorMessage: errors.slice(0, 20).join("；") || null,
      completedAt: new Date(),
    },
  });

  return {
    importLogId: importLog.id,
    totalRows: rows.length,
    importedRows,
    createdRows,
    updatedRows,
    deletedRows: anomalyRows ? 0 : deletedRows,
    skippedRows: Math.max(0, rows.length - importedRows),
    anomalyRows,
    sheetName,
    status,
    errors: errors.slice(0, 50),
  };
}
