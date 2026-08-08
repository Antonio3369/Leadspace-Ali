/** 上传大表：支持同步结果或 202 + jobId 轮询 */

import { readResponseJson } from "@/lib/fetch-json";

const TRANSIENT_HTTP = new Set([502, 503, 504]);
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 15 * 60 * 1000;

function jobStorageKey(endpoint: string) {
  return `leadspace-import-job:${endpoint}`;
}

function isTransientHttpStatus(status: number): boolean {
  return TRANSIENT_HTTP.has(status);
}

async function readJsonBody(res: Response, context: string): Promise<Record<string, unknown>> {
  return readResponseJson<Record<string, unknown>>(res, context);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function uploadImportWithJobPoll<T>(
  endpoint: string,
  file: File,
  onProgress: (value: number, label: string) => void
): Promise<T> {
  onProgress(5, "正在上传文件…");

  const formData = new FormData();
  formData.append("file", file);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(endpoint, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
  } catch {
    throw new Error("上传时网络中断，请检查网络后重试。");
  }

  let uploadJson: {
    error?: string;
    async?: boolean;
    jobId?: string;
  } & T;

  if (isTransientHttpStatus(uploadRes.status)) {
    throw new Error(
      "上传时服务短暂不可用，请等待 30 秒后重新上传；若刚才已开始导入，请刷新页面查看是否已有数据。"
    );
  }

  try {
    uploadJson = (await readJsonBody(uploadRes, "上传")) as typeof uploadJson;
  } catch (err) {
    if (uploadRes.status >= 500) {
      throw new Error(
        `上传失败（HTTP ${uploadRes.status}）。请稍后重新上传；若数据已开始写入，刷新页面查看。`
      );
    }
    throw err;
  }

  if (!uploadRes.ok) {
    if (uploadRes.status === 401) {
      throw new Error("登录已过期，请重新登录后再导入");
    }
    const fallback =
      uploadRes.status === 413
        ? "上传文件过大或传输中断，请确认文件小于 60MB 后重试。"
        : uploadRes.status === 429
          ? "当前已有导入任务在执行，请等完成后再试。"
          : uploadRes.status >= 500
            ? `服务器错误（${uploadRes.status}），请稍后重试。`
            : "上传失败";
    throw new Error(
      typeof uploadJson.error === "string" ? uploadJson.error : fallback
    );
  }

  // 兼容旧同步响应
  if (!uploadJson.async || !uploadJson.jobId) {
    onProgress(100, "导入完成");
    return uploadJson as T;
  }

  const jobId = uploadJson.jobId;
  try {
    sessionStorage.setItem(jobStorageKey(endpoint), jobId);
  } catch {
    /* ignore */
  }

  onProgress(20, "文件已上传，后台导入中…");
  return pollImportJob<T>(jobId, endpoint, onProgress);
}

/** 页面刷新后恢复轮询未完成的导入任务 */
export async function resumeImportJobPoll<T>(
  endpoint: string,
  onProgress: (value: number, label: string) => void
): Promise<T | null> {
  let jobId: string | null = null;
  try {
    jobId = sessionStorage.getItem(jobStorageKey(endpoint));
  } catch {
    return null;
  }
  if (!jobId) return null;

  const probe = await fetch(`/api/import/jobs/${encodeURIComponent(jobId)}`, {
    credentials: "same-origin",
  });
  const probeJob = (await readJsonBody(probe, "查询导入进度")) as {
    status?: string;
    errorMessage?: string | null;
    result?: T;
  };

  if (!probe.ok || probeJob.status === "FAILED") {
    clearJobStorage(endpoint);
    const msg = probeJob.errorMessage;
    if (typeof msg === "string" && msg.includes("服务重启")) {
      return null;
    }
    if (!probe.ok && TRANSIENT_HTTP.has(probe.status)) {
      return null;
    }
    if (typeof msg === "string" && msg) {
      throw new Error(msg);
    }
    return null;
  }
  if (probeJob.status === "SUCCESS") {
    clearJobStorage(endpoint);
    return (probeJob.result ?? null) as T | null;
  }

  onProgress(20, "检测到未完成的导入，继续等待…");
  return pollImportJob<T>(jobId, endpoint, onProgress);
}

function clearJobStorage(endpoint: string) {
  try {
    sessionStorage.removeItem(jobStorageKey(endpoint));
  } catch {
    /* ignore */
  }
}

async function pollImportJob<T>(
  jobId: string,
  endpoint: string,
  onProgress: (value: number, label: string) => void
): Promise<T> {
  const startedAt = Date.now();
  let sawTransient = false;
  let lastServerProgress = -1;
  let lastProgressChangeAt = Date.now();

  try {
    for (;;) {
      await sleep(POLL_INTERVAL_MS);
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error(
          "导入等待超过 15 分钟。若曾显示「后台导入中」，请刷新页面查看数据；若无数据请重新上传。"
        );
      }

      if (
        Date.now() - lastProgressChangeAt > 3 * 60 * 1000 &&
        lastServerProgress >= 0
      ) {
        clearJobStorage(endpoint);
        throw new Error(
          "导入超过 3 分钟无进展，可能已中断。请重新上传；若数据已写入可刷新看板确认。"
        );
      }

      let res: Response;
      try {
        res = await fetch(`/api/import/jobs/${encodeURIComponent(jobId)}`, {
          credentials: "same-origin",
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        sawTransient = true;
        onProgress(
          25,
          `网络波动，继续等待导入…（${elapsedSec}s）`
        );
        continue;
      }

      if (isTransientHttpStatus(res.status)) {
        sawTransient = true;
        onProgress(
          25,
          `服务重启中，大表仍在后台导入…（${elapsedSec}s）`
        );
        continue;
      }

      const job = (await readJsonBody(res, "查询导入进度")) as {
        error?: string;
        status?: string;
        progress?: number;
        message?: string | null;
        errorMessage?: string | null;
        result?: T;
        updatedAt?: string;
      };

      if (!res.ok) {
        if (res.status === 401) {
          clearJobStorage(endpoint);
          throw new Error("登录已过期，请重新登录后再导入");
        }
        if (res.status === 404) {
          clearJobStorage(endpoint);
          throw new Error("导入任务不存在，请重新上传。");
        }
        throw new Error(
          typeof job.error === "string" ? job.error : "查询导入进度失败"
        );
      }

      const progress = Math.min(99, Math.max(20, job.progress ?? 20));
      const label =
        job.message ||
        (elapsedSec >= 20
          ? `后台导入中…已用时 ${elapsedSec}s`
          : "后台导入中…");
      onProgress(progress, label);

      if (job.progress != null && job.progress !== lastServerProgress) {
        lastServerProgress = job.progress;
        lastProgressChangeAt = Date.now();
      } else if (job.updatedAt) {
        const updatedAt = new Date(job.updatedAt).getTime();
        if (!Number.isNaN(updatedAt) && updatedAt > lastProgressChangeAt) {
          lastProgressChangeAt = updatedAt;
        }
      }

      if (job.status === "SUCCESS") {
        clearJobStorage(endpoint);
        onProgress(100, "导入完成");
        return (job.result ?? {}) as T;
      }
      if (job.status === "FAILED" || job.status === "PARTIAL") {
        if (job.status === "PARTIAL" && job.result) {
          clearJobStorage(endpoint);
          onProgress(100, "导入完成（部分成功）");
          return job.result as T;
        }
        clearJobStorage(endpoint);
        const failMsg =
          typeof job.errorMessage === "string" ? job.errorMessage : "导入失败";
        if (failMsg.includes("服务重启")) {
          throw new Error(
            "导入因服务更新中断，请重新选择文件并点击导入（数据未完整写入时需重导）。"
          );
        }
        throw new Error(failMsg);
      }
    }
  } catch (err) {
    throw err;
  }
}
