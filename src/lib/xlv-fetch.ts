import { fetchJsonWithRetry } from "@/lib/fetch-json";
import { readXlvApiCache, writeXlvApiCache } from "@/lib/xlv-api-cache";

/** 带 Tab 缓存的 XLV GET：有缓存先返回，后台静默刷新 */
export async function fetchXlvJson<T>(
  url: string,
  opts?: {
    context?: string;
    maxAttempts?: number;
    retryDelayMs?: number;
    onRetry?: (attempt: number) => void;
    /** 设为 false 可跳过读缓存（强制刷新） */
    useCache?: boolean;
  }
): Promise<T> {
  const useCache = opts?.useCache !== false;
  const cached = useCache ? readXlvApiCache<T>(url) : null;

  const load = () =>
    fetchJsonWithRetry<T>(url, undefined, {
      context: opts?.context,
      maxAttempts: opts?.maxAttempts,
      retryDelayMs: opts?.retryDelayMs,
      onRetry: opts?.onRetry,
    }).then((fresh) => {
      writeXlvApiCache(url, fresh);
      return fresh;
    });

  if (cached) {
    void load().catch(() => undefined);
    return cached;
  }

  return load();
}
