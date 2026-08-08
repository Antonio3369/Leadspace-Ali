/** 安全解析 fetch 响应（避免 Safari 在 HTML/502 上 json() 抛 "expected pattern"） */

const TRANSIENT_HTTP = new Set([502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readResponseJson<T = Record<string, unknown>>(
  res: Response,
  context = "请求"
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (TRANSIENT_HTTP.has(res.status)) {
      throw new TransientHttpError(res.status, context);
    }
    throw new Error(
      `${context}失败（HTTP ${res.status}）。请重新登录后重试，若仍失败请联系管理员。`
    );
  }
}

export class TransientHttpError extends Error {
  readonly status: number;
  readonly context: string;

  constructor(status: number, context: string) {
    super(`${context}时服务短暂不可用（HTTP ${status}），请稍后刷新页面重试。`);
    this.name = "TransientHttpError";
    this.status = status;
    this.context = context;
  }
}

export function isTransientHttpError(err: unknown): boolean {
  return err instanceof TransientHttpError || (
    err instanceof Error &&
    TRANSIENT_HTTP.has(Number((err as TransientHttpError).status))
  );
}

/** 读 API：502/503/504 与网络中断时自动重试（容器重启期间） */
export async function fetchJsonWithRetry<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: {
    context?: string;
    maxAttempts?: number;
    retryDelayMs?: number;
    onRetry?: (attempt: number) => void;
  }
): Promise<T> {
  const context = opts?.context ?? "请求";
  const maxAttempts = opts?.maxAttempts ?? 8;
  const retryDelayMs = opts?.retryDelayMs ?? 2000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(input, {
        ...init,
        credentials: init?.credentials ?? "same-origin",
      });
    } catch {
      lastError = new Error(`${context}时网络中断，请检查网络后重试。`);
      if (attempt < maxAttempts) {
        opts?.onRetry?.(attempt);
        await sleep(retryDelayMs);
        continue;
      }
      throw lastError;
    }

    if (TRANSIENT_HTTP.has(res.status) && attempt < maxAttempts) {
      opts?.onRetry?.(attempt);
      await sleep(retryDelayMs);
      continue;
    }

    const json = await readResponseJson<T & { error?: string }>(res, context);
    if (!res.ok) {
      throw new Error(
        typeof json.error === "string" ? json.error : `${context}失败`
      );
    }
    return json as T;
  }

  throw lastError ?? new Error(`${context}失败`);
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
