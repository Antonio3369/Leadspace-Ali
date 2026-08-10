/** 团队看板：短时服务端缓存 + 同 key 请求去重，避免 Tab 切换时并发重算打爆内存 */

const TTL_MS = 60_000;

const cache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

export async function withXlvBoardCache<T>(
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.data as T;
  }

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const pending = loader()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
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
