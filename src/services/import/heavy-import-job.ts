import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { getPgPool } from "@/lib/pg-pool";
import {
  releaseImportLock,
  resetImportLock,
  tryAcquireImportLock,
} from "@/lib/import-lock";
import { importPersonnelFromBuffer } from "@/services/import/personnel-importer";
import { importN7ExcelFile } from "@/services/import/n7-excel-importer";
import { importXlvExcelFileFromPath } from "@/services/import/xlv-excel-importer";
import { invalidateXlvBoardCache } from "@/services/xlv/board-cache";
import { importExcelFile } from "@/services/import/excel-importer";
import {
  notifyXlvOutboundCompanyBoardSummary,
  notifyXlvOutboundImportSuccess,
} from "@/services/xlv/outbound-notifier";

export type HeavyImportKind = "personnel" | "n7" | "xlh-excel" | "xlv";

export const STALE_IMPORT_JOB_MS = 3 * 60 * 1000;

export type HeavyImportJobSnapshot = {
  id: string;
  kind: string;
  fileName: string;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "PARTIAL";
  progress: number;
  message: string | null;
  errorMessage: string | null;
  result: unknown;
  completedAt: Date | null;
  updatedAt: Date;
};

type HeavyImportJobRow = NonNullable<
  Awaited<ReturnType<typeof db.heavyImportJob.findUnique>>
>;

export function isRunningImportStatus(status: string) {
  return status === "PENDING" || status === "PROCESSING";
}

/** 超时未更新的进行中任务，对外呈现为已中断 */
export function presentHeavyImportJob(
  job: HeavyImportJobRow
): HeavyImportJobSnapshot {
  const isStale =
    !job.completedAt &&
    isRunningImportStatus(job.status) &&
    Date.now() - job.updatedAt.getTime() > STALE_IMPORT_JOB_MS;

  if (isStale) {
    return {
      id: job.id,
      kind: job.kind,
      fileName: job.fileName,
      status: "FAILED",
      progress: job.progress,
      message: "导入任务已中断",
      errorMessage: "导入超时或服务重启导致中断，请重新上传。",
      result: null,
      completedAt: job.completedAt,
      updatedAt: job.updatedAt,
    };
  }

  return {
    id: job.id,
    kind: job.kind,
    fileName: job.fileName,
    status: job.status,
    progress: job.progress,
    message: job.message,
    errorMessage: job.errorMessage,
    result: job.resultJson,
    completedAt: job.completedAt,
    updatedAt: job.updatedAt,
  };
}

export async function getActiveHeavyImportJob(opts: {
  kind: HeavyImportKind;
  uploadedById: string;
  directorView: boolean;
}) {
  const job = await db.heavyImportJob.findFirst({
    where: {
      kind: opts.kind,
      status: { in: ["PENDING", "PROCESSING"] },
      ...(opts.directorView ? {} : { uploadedById: opts.uploadedById }),
    },
    orderBy: { createdAt: "desc" },
  });
  return job ? presentHeavyImportJob(job) : null;
}

/** 应用启动时：释放内存锁，并将孤儿导入任务标为失败（每进程仅执行一次） */
const RECOVERED_KEY = Symbol.for("leadspace.heavyImport.recovered");

export async function recoverOrphanedHeavyImportJobs() {
  if ((globalThis as Record<symbol, boolean>)[RECOVERED_KEY]) return;
  (globalThis as Record<symbol, boolean>)[RECOVERED_KEY] = true;

  resetImportLock();
  const result = await db.heavyImportJob
    .updateMany({
      where: { status: { in: ["PROCESSING", "PENDING"] } },
      data: {
        status: "FAILED",
        progress: 100,
        message: "导入已中断",
        errorMessage: "服务重启导致导入中断，请重新上传。",
        completedAt: new Date(),
      },
    })
    .catch(() => ({ count: 0 }));
  if (result.count > 0) {
    console.info(
      `[import] marked ${result.count} orphaned heavy import job(s) as FAILED`
    );
  }
}

const IMPORT_DIR =
  process.env.IMPORT_JOB_DIR || path.join("/tmp", "leadspace-import-jobs");

function ensureImportDir() {
  fs.mkdirSync(IMPORT_DIR, { recursive: true });
}

function filePathFor(jobId: string) {
  return path.join(IMPORT_DIR, `${jobId}.xlsx`);
}

export async function enqueueHeavyImport(opts: {
  kind: HeavyImportKind;
  fileName: string;
  buffer: Buffer;
  uploadedById: string;
}): Promise<{ jobId: string } | { error: string; status: number }> {
  if (!tryAcquireImportLock(opts.kind)) {
    return {
      status: 429,
      error:
        "当前已有导入任务在执行，请等完成后再试。正常看数、登录不受影响。",
    };
  }

  // 清理因部署/重启卡住的僵尸任务，避免占着「进行中」状态
  await db.heavyImportJob
    .updateMany({
      where: {
        kind: opts.kind,
        status: { in: ["PROCESSING", "PENDING"] },
        updatedAt: { lt: new Date(Date.now() - 20 * 60 * 1000) },
      },
      data: {
        status: "FAILED",
        errorMessage: "导入超时或服务重启导致中断，请重新上传。",
        completedAt: new Date(),
      },
    })
    .catch(() => undefined);

  let jobId: string | null = null;
  try {
    ensureImportDir();
    const job = await db.heavyImportJob.create({
      data: {
        kind: opts.kind,
        fileName: opts.fileName,
        status: "PENDING",
        progress: 5,
        message: "已接收文件，排队处理…",
        uploadedById: opts.uploadedById,
      },
    });
    jobId = job.id;
    fs.writeFileSync(filePathFor(job.id), opts.buffer);

    // 尽快结束 HTTP 请求；真正导入在后台跑
    setImmediate(() => {
      void runHeavyImportJob(job.id);
    });

    return { jobId: job.id };
  } catch (err) {
    releaseImportLock();
    if (jobId) {
      try {
        fs.unlinkSync(filePathFor(jobId));
      } catch {
        /* ignore */
      }
      await db.heavyImportJob
        .update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "创建任务失败",
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
    throw err;
  }
}

async function runHeavyImportJob(jobId: string) {
  const filePath = filePathFor(jobId);
  let buffer: Buffer | null = null;
  try {
    const job = await db.heavyImportJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await db.heavyImportJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        progress: 15,
        message: "正在解析并写入数据库…",
      },
    });

    let result: unknown;
    let finalStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";

    if (job.kind === "personnel") {
      buffer = fs.readFileSync(filePath);
      result = {
        type: "personnel",
        status: "SUCCESS",
        ...(await importPersonnelFromBuffer(buffer)),
      };
    } else if (job.kind === "n7") {
      buffer = fs.readFileSync(filePath);
      const n7 = await importN7ExcelFile(buffer, job.fileName, job.uploadedById);
      result = n7;
      if (n7.status === "FAILED") finalStatus = "FAILED";
      else if (n7.status === "PARTIAL") finalStatus = "PARTIAL";
    } else if (job.kind === "xlh-excel") {
      buffer = fs.readFileSync(filePath);
      result = await importExcelFile(buffer, job.fileName, job.uploadedById);
      if ((result as { status?: string }).status === "FAILED") finalStatus = "FAILED";
      else if ((result as { status?: string }).status === "PARTIAL")
        finalStatus = "PARTIAL";
    } else if (job.kind === "xlv") {
      let lastWrittenProgress = -1;
      const reportProgress = async (progress: number, message: string) => {
        if (progress < 100 && progress === lastWrittenProgress) return;
        lastWrittenProgress = progress;
        await db.heavyImportJob
          .update({
            where: { id: jobId },
            data: { progress, message },
          })
          .catch(() => undefined);
      };
      const xlv = await importXlvExcelFileFromPath(
        filePath,
        job.fileName,
        job.uploadedById,
        { onProgress: reportProgress }
      );
      result = xlv;
      if (xlv.status === "FAILED") finalStatus = "FAILED";
      else {
        if (xlv.status === "PARTIAL") finalStatus = "PARTIAL";
        invalidateXlvBoardCache();
      }
    } else {
      throw new Error(`未知导入类型: ${job.kind}`);
    }

    if (finalStatus === "FAILED") {
      throw new Error(
        (result as { errors?: string[] })?.errors?.[0] || "导入失败"
      );
    }

    await db.heavyImportJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        progress: 100,
        message: finalStatus === "PARTIAL" ? "导入完成（部分成功）" : "导入完成",
        resultJson: result as object,
        completedAt: new Date(),
      },
    });

    if (job.kind === "xlv") {
      const uploader = await db.user
        .findUnique({
          where: { id: job.uploadedById },
          select: { name: true },
        })
        .catch(() => null);
      void notifyXlvOutboundImportSuccess({
        fileName: job.fileName,
        status: finalStatus,
        uploadedByName: uploader?.name?.trim() || "未知",
        result,
      }).catch((err) => {
        console.warn("[xlv-outbound] import success notify failed:", err);
      });

      const importFormat =
        result && typeof result === "object"
          ? (result as { format?: string }).format
          : undefined;
      if (importFormat === "assignment") {
        void notifyXlvOutboundCompanyBoardSummary().catch((err) => {
          console.warn("[xlv-outbound] company board summary notify failed:", err);
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    await db.heavyImportJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          progress: 100,
          message: "导入失败",
          errorMessage: message,
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  } finally {
    buffer = null;
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    releaseImportLock();
  }
}

export async function getHeavyImportJob(jobId: string) {
  try {
    return await db.heavyImportJob.findUnique({ where: { id: jobId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!message.includes("bind message")) {
      throw err;
    }
    return getHeavyImportJobViaPg(jobId);
  }
}

async function getHeavyImportJobViaPg(jobId: string): Promise<HeavyImportJobRow | null> {
  const pool = getPgPool();
  const res = await pool.query<{
    id: string;
    kind: string;
    fileName: string;
    status: HeavyImportJobRow["status"];
    progress: number;
    message: string | null;
    errorMessage: string | null;
    resultJson: HeavyImportJobRow["resultJson"];
    uploadedById: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
  }>(
    `SELECT id, kind, "fileName", status, progress, message, "errorMessage", "resultJson",
            "uploadedById", "createdAt", "updatedAt", "completedAt"
     FROM "HeavyImportJob"
     WHERE id = $1
     LIMIT 1`,
    [jobId]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    status: row.status,
    progress: row.progress,
    message: row.message,
    errorMessage: row.errorMessage,
    resultJson: row.resultJson,
    uploadedById: row.uploadedById,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    completedAt: row.completedAt ? new Date(row.completedAt) : null,
  };
}
