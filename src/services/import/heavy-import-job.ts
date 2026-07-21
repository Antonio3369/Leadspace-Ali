import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import {
  releaseImportLock,
  tryAcquireImportLock,
} from "@/lib/import-lock";
import { importPersonnelFromBuffer } from "@/services/import/personnel-importer";
import { importN7ExcelFile } from "@/services/import/n7-excel-importer";
import { importExcelFile } from "@/services/import/excel-importer";

export type HeavyImportKind = "personnel" | "n7" | "xlh-excel";

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

    const buffer = fs.readFileSync(filePath);
    let result: unknown;
    let finalStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";

    if (job.kind === "personnel") {
      result = {
        type: "personnel",
        status: "SUCCESS",
        ...(await importPersonnelFromBuffer(buffer)),
      };
    } else if (job.kind === "n7") {
      const n7 = await importN7ExcelFile(buffer, job.fileName, job.uploadedById);
      result = n7;
      if (n7.status === "FAILED") finalStatus = "FAILED";
      else if (n7.status === "PARTIAL") finalStatus = "PARTIAL";
    } else if (job.kind === "xlh-excel") {
      result = await importExcelFile(buffer, job.fileName, job.uploadedById);
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
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    releaseImportLock();
  }
}

export async function getHeavyImportJob(jobId: string) {
  return db.heavyImportJob.findUnique({ where: { id: jobId } });
}
