import { fetchJsonWithRetry } from "@/lib/fetch-json";
import {
  readXlvApiCache,
  runXlvApiOnce,
  shouldBackgroundRefreshXlvApi,
} from "@/lib/xlv-api-cache";

/** 带 Tab 缓存的 XLV GET：有缓存先返回，必要时后台静默刷新 */
export async function fetchXlvJson<T>(
  url: string,
  opts?: {
    context?: string;
    maxAttempts?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onRetry?: (attempt: number) => void;
    /** 设为 false 可跳过读缓存（强制刷新） */
    useCache?: boolean;
  }
): Promise<T> {
  const useCache = opts?.useCache !== false;
  const cached = useCache ? readXlvApiCache<T>(url) : null;

  const load = () =>
    runXlvApiOnce(url, () =>
      fetchJsonWithRetry<T>(
        url,
        opts?.signal ? { signal: opts.signal } : undefined,
        {
          context: opts?.context,
          maxAttempts: opts?.maxAttempts,
          retryDelayMs: opts?.retryDelayMs,
          timeoutMs: opts?.timeoutMs,
          onRetry: opts?.onRetry,
        }
      )
    );

  if (cached) {
    if (shouldBackgroundRefreshXlvApi(url)) {
      void load().catch(() => undefined);
    }
    return cached;
  }

  return load();
}
