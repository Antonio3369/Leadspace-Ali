/** 小绿盒 Tab 切换：短时缓存 + 后台刷新，避免每次导航都冷启动 API */

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

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

export function prefetchXlvApi(url: string) {
  if (readXlvApiCache(url)) return;
  void fetch(url, { credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      writeXlvApiCache(url, data);
    })
    .catch(() => undefined);
}
