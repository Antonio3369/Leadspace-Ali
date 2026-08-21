/** 团队看板：短时服务端缓存 + 同 key 请求去重，避免 Tab 切换时并发重算打爆内存 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 8;

const cache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

function readCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.data;
}

function writeCache(key: string, data: unknown) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), data });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest || oldest === key) break;
    cache.delete(oldest);
  }
}

export async function withXlvBoardCache<T>(
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  const hit = readCache(key);
  if (hit !== null) {
    return hit as T;
  }

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const pending = loader()
    .then((data) => {
      writeCache(key, data);
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

export function invalidateXlvBoardCache() {
  cache.clear();
}
