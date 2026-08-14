/** 小绿盒 Tab 切换：短时缓存 + 去重/串行请求，避免并发打爆服务端 */

const TTL_MS = 60_000;
/** 缓存仍有效时跳过后台刷新，减少切换 Tab 时的并发峰值 */
const MIN_REFRESH_MS = 20_000;

const cache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
const inFlightStartedAt = new Map<string, number>();

/** 进行中的同 URL 请求超过该时长则不再复用，避免永远卡在 loading */
const IN_FLIGHT_STALE_MS = 90_000;

const prefetchQueue: string[] = [];
let prefetchRunning = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function xlvApiCacheKey(url: string) {
  return url;
}

export function readXlvApiCache<T>(url: string): T | null {
  const hit = cache.get(xlvApiCacheKey(url));
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.data as T;
}

export function writeXlvApiCache(url: string, data: unknown) {
  cache.set(xlvApiCacheKey(url), { at: Date.now(), data });
}

export function isXlvApiInFlight(url: string) {
  return inFlight.has(xlvApiCacheKey(url));
}

export function hasXlvApiInFlightPrefix(prefix: string) {
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export function cacheAgeMs(url: string) {
  const hit = cache.get(xlvApiCacheKey(url));
  if (!hit) return null;
  return Date.now() - hit.at;
}

/** 同 URL 复用进行中的 Promise，避免预取与页面请求叠加 */
export function runXlvApiOnce<T>(
  url: string,
  loader: () => Promise<T>
): Promise<T> {
  const key = xlvApiCacheKey(url);
  const existing = inFlight.get(key);
  if (existing) {
    const started = inFlightStartedAt.get(key);
    if (started == null || Date.now() - started < IN_FLIGHT_STALE_MS) {
      return existing as Promise<T>;
    }
    inFlight.delete(key);
    inFlightStartedAt.delete(key);
  }

  inFlightStartedAt.set(key, Date.now());
  const pending = loader()
    .then((data) => {
      writeXlvApiCache(url, data);
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
      inFlightStartedAt.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

async function drainPrefetchQueue() {
  if (prefetchRunning) return;
  prefetchRunning = true;
  try {
    while (prefetchQueue.length > 0) {
      const url = prefetchQueue.shift()!;
      if (readXlvApiCache(url) || isXlvApiInFlight(url)) continue;
      try {
        await runXlvApiOnce(url, async () => {
          const res = await fetch(url, { credentials: "same-origin" });
          if (!res.ok) throw new Error(`prefetch ${res.status}`);
          return res.json();
        });
      } catch {
        // 预取失败不打断队列
      }
      await sleep(500);
    }
  } finally {
    prefetchRunning = false;
  }
}

export function prefetchXlvApi(url: string) {
  if (readXlvApiCache(url) || isXlvApiInFlight(url)) return;
  if (!prefetchQueue.includes(url)) prefetchQueue.push(url);
  void drainPrefetchQueue();
}

/** 按顺序预取，避免三个重接口同时打满内存 */
export function prefetchXlvApisSequential(urls: string[]) {
  for (const url of urls) {
    if (readXlvApiCache(url) || isXlvApiInFlight(url)) continue;
    if (!prefetchQueue.includes(url)) prefetchQueue.push(url);
  }
  void drainPrefetchQueue();
}

export function shouldBackgroundRefreshXlvApi(url: string) {
  const age = cacheAgeMs(url);
  return age == null || age >= MIN_REFRESH_MS;
}
