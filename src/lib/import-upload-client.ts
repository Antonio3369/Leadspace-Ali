/** 上传大表：支持同步结果或 202 + jobId 轮询 */

import { readResponseJson } from "@/lib/fetch-json";

const TRANSIENT_HTTP = new Set([502, 503, 504]);
const STALE_PROCESSING_MS = 45_000;

export type ImportRestartContext = {
  fileName?: string;
  progress?: number;
};

export function formatImportRestartNotice(context: ImportRestartContext = {}) {
  const fileLabel = context.fileName ? `「${context.fileName}」` : "这份文件";
  const progressLabel =
    context.progress != null && context.progress > 0
      ? `（约 ${context.progress}% 时中断）`
      : "";

  return {
    title: "导入未成功",
    body: `${fileLabel}${progressLabel}没有导完，不能算成功。请重新选择文件再传一遍。`,
  };
}

export class ImportRestartInterruptedError extends Error {
  readonly context: ImportRestartContext;

  constructor(context: ImportRestartContext = {}) {
    super(formatImportRestartNotice(context).body);
    this.name = "ImportRestartInterruptedError";
    this.context = context;
  }
}

export function isImportRestartInterrupted(
  err: unknown
): err is ImportRestartInterruptedError {
  return err instanceof ImportRestartInterruptedError;
}

function isImportRestartMessage(message: string): boolean {
  return message.includes("服务重启") || message.includes("服务更新");
}

export type ImportJobSnapshot = {
  id: string;
  kind: string;
  fileName: string;
  status: string;
  progress: number;
  message: string | null;
  errorMessage: string | null;
  updatedAt?: string;
};

export const IMPORT_ENDPOINT_KIND: Record<string, string> = {
  "/api/import/xlv": "xlv",
  "/api/import/n7": "n7",
  "/api/import/personnel": "personnel",
  "/api/import/excel": "xlh-excel",
};

export class ImportJobBusyError extends Error {
  readonly endpoint: string;

  constructor(endpoint: string) {
    super("当前已有导入任务在执行，请等待完成后再试。");
    this.name = "ImportJobBusyError";
    this.endpoint = endpoint;
  }
}

export function isImportJobBusyError(err: unknown): err is ImportJobBusyError {
  return err instanceof ImportJobBusyError;
}

export function describeImportJobStatus(job: ImportJobSnapshot): {
  tone: "info" | "warning" | "success" | "error";
  title: string;
  body: string;
} {
  switch (job.status) {
    case "PENDING":
      return {
        tone: "info",
        title: "导入排队中",
        body: `「${job.fileName}」已上传，正在排队写入，请勿重复上传。`,
      };
    case "PROCESSING":
      return {
        tone: "info",
        title: `正在导入 · ${job.progress}%`,
        body: `「${job.fileName}」正在写入数据库。${job.message ? `${job.message} ` : ""}请保持页面打开，完成后会自动提示。`,
      };
    case "SUCCESS":
      return {
        tone: "success",
        title: "导入已完成",
        body: `「${job.fileName}」已成功导入，可看板核对数据。`,
      };
    case "FAILED":
      return {
        tone: "error",
        title: "导入未成功",
        body: job.errorMessage || job.message || "导入失败，请核对后重试。",
      };
    default:
      return {
        tone: "info",
        title: "导入处理中",
        body: job.message || "请稍候…",
      };
  }
}

function formatImportJobProgressLabel(job: {
  fileName?: string;
  progress?: number;
  message?: string | null;
  status?: string;
}) {
  const file = job.fileName ? `「${job.fileName}」` : "文件";
  if (job.status === "PENDING") {
    return `排队中 · ${file}`;
  }
  const pct = job.progress ?? 0;
  return job.message || `正在导入 ${file} · ${pct}%`;
}

async function fetchActiveImportJob(
  kind: string
): Promise<ImportJobSnapshot | null> {
  let res: Response;
  try {
    res = await fetch(
      `/api/import/jobs/active?kind=${encodeURIComponent(kind)}`,
      { credentials: "same-origin" }
    );
  } catch {
    return null;
  }
  const data = (await readJsonBody(res, "查询导入状态")) as {
    active?: boolean;
    job?: ImportJobSnapshot | null;
  };
  if (!res.ok || !data.active || !data.job) {
    return null;
  }
  return data.job;
}

export async function peekActiveImportJob(
  endpoint: string
): Promise<ImportJobSnapshot | null> {
  const kind = IMPORT_ENDPOINT_KIND[endpoint];
  if (!kind) return null;
  return fetchActiveImportJob(kind);
}

export async function followActiveImportJob<T>(
  endpoint: string,
  onProgress: (value: number, label: string) => void,
  onJobSnapshot?: (job: ImportJobSnapshot | null) => void
): Promise<T | null> {
  const kind = IMPORT_ENDPOINT_KIND[endpoint];
  if (!kind) return null;

  const active = await fetchActiveImportJob(kind);
  onJobSnapshot?.(active);
  if (
    !active?.id ||
    (active.status !== "PENDING" && active.status !== "PROCESSING")
  ) {
    return null;
  }

  try {
    sessionStorage.setItem(jobStorageKey(endpoint), active.id);
  } catch {
    /* ignore */
  }

  onProgress(
    Math.min(99, Math.max(20, active.progress ?? 20)),
    formatImportJobProgressLabel(active)
  );

  try {
    return await pollImportJob<T>(active.id, endpoint, onProgress);
  } catch (err) {
    if (isImportRestartInterrupted(err)) {
      return null;
    }
    throw err;
  }
}

/** 恢复 session 中的任务，或跟进服务端进行中的导入 */
export async function resumeOrFollowActiveImport<T>(
  endpoint: string,
  onProgress: (value: number, label: string) => void,
  onJobSnapshot?: (job: ImportJobSnapshot | null) => void
): Promise<T | null> {
  const kind = IMPORT_ENDPOINT_KIND[endpoint];
  if (kind) {
    const active = await fetchActiveImportJob(kind);
    onJobSnapshot?.(active);
    if (
      active?.id &&
      (active.status === "PENDING" || active.status === "PROCESSING")
    ) {
      try {
        sessionStorage.setItem(jobStorageKey(endpoint), active.id);
      } catch {
        /* ignore */
      }
      onProgress(
        Math.min(99, Math.max(20, active.progress ?? 20)),
        formatImportJobProgressLabel(active)
      );
      try {
        return await pollImportJob<T>(active.id, endpoint, onProgress);
      } catch (err) {
        if (isImportRestartInterrupted(err)) {
          return null;
        }
        throw err;
      }
    }
  }

  const fromSession = await resumeImportJobPoll<T>(endpoint, onProgress);
  if (fromSession) return fromSession;
  return followActiveImportJob<T>(endpoint, onProgress, onJobSnapshot);
}

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 15 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

function jobStorageKey(endpoint: string) {
  return `leadspace-import-job:${endpoint}`;
}

function isTransientHttpStatus(status: number): boolean {
  return TRANSIENT_HTTP.has(status);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
    uploadRes = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      },
      UPLOAD_TIMEOUT_MS
    );
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      throw new Error(
        "上传等待超时（大表上传较慢）。请保持页面打开、网络稳定后重试；若进度条曾出现「后台导入中」，刷新页面查看是否已在导入。"
      );
    }
    throw new Error(
      "上传时网络中断，请检查网络后重试。若刚部署过服务，请等待 1 分钟再传。"
    );
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
    if (uploadRes.status === 429) {
      throw new ImportJobBusyError(endpoint);
    }
    const fallback =
      uploadRes.status === 413
        ? "上传文件过大或传输中断，请确认文件小于 100MB 后重试。"
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

  let probe: Response;
  try {
    probe = await fetch(`/api/import/jobs/${encodeURIComponent(jobId)}`, {
      credentials: "same-origin",
    });
  } catch {
    return null;
  }
  if (isTransientHttpStatus(probe.status)) {
    return null;
  }
  const probeJob = (await readJsonBody(probe, "查询导入进度")) as {
    status?: string;
    fileName?: string;
    progress?: number;
    errorMessage?: string | null;
    result?: T;
    updatedAt?: string;
  };

  if (!probe.ok || probeJob.status === "FAILED") {
    clearJobStorage(endpoint);
    const msg = probeJob.errorMessage;
    if (typeof msg === "string" && isImportRestartMessage(msg)) {
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

  if (probeJob.status === "PROCESSING" || probeJob.status === "PENDING") {
    const updatedAt = probeJob.updatedAt
      ? new Date(probeJob.updatedAt).getTime()
      : 0;
    if (updatedAt && Date.now() - updatedAt > STALE_PROCESSING_MS) {
      clearJobStorage(endpoint);
      return null;
    }
  }

  onProgress(20, "检测到未完成的导入，继续等待…");
  try {
    return await pollImportJob<T>(jobId, endpoint, onProgress);
  } catch (err) {
    if (isImportRestartInterrupted(err)) {
      return null;
    }
    throw err;
  }
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
        res = await fetchWithTimeout(
          `/api/import/jobs/${encodeURIComponent(jobId)}`,
          { credentials: "same-origin" },
          30_000
        );
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
        fileName?: string;
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
      const label = formatImportJobProgressLabel({
        fileName: job.fileName,
        progress: job.progress,
        message: job.message,
        status: job.status,
      });
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
        if (isImportRestartMessage(failMsg)) {
          throw new ImportRestartInterruptedError({
            fileName: job.fileName,
            progress: job.progress,
          });
        }
        throw new Error(failMsg);
      }
    }
  } catch (err) {
    throw err;
  }
}
