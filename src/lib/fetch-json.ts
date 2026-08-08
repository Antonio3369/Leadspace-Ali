/** 安全解析 fetch 响应（避免 Safari 在 HTML/502 上 json() 抛 "expected pattern"） */

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
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        `${context}时服务短暂不可用（HTTP ${res.status}），请稍后刷新页面重试。`
      );
    }
    throw new Error(
      `${context}失败（HTTP ${res.status}）。请重新登录后重试，若仍失败请联系管理员。`
    );
  }
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
