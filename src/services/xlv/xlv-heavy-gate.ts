/** 限制小绿盒重查询并发，避免多 Tab 并发 OOM，又避免严格串行导致切页长时间空白 */

const HEAVY_GATE_TIMEOUT_MS = 120_000;
/** 允许 2 路重查询并行（如看板 + 待办）；原先串行会导致切 Tab 排队 30s+ */
const MAX_CONCURRENT = 2;
/** RSS 贴阈值时改串行，避免看板+待办叠加重算 */
const RSS_SERIALIZE_MB = 1000;

let running = 0;
const waitQueue: Array<() => void> = [];

function maxConcurrentNow() {
  const rssMb = process.memoryUsage().rss / 1024 / 1024;
  return rssMb >= RSS_SERIALIZE_MB ? 1 : MAX_CONCURRENT;
}

function acquire(): Promise<void> {
  if (running < maxConcurrentNow()) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      running += 1;
      resolve();
    });
  });
}

function release() {
  running = Math.max(0, running - 1);
  const next = waitQueue.shift();
  if (next) next();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function withXlvHeavyGate<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await withTimeout(
      Promise.resolve().then(fn),
      HEAVY_GATE_TIMEOUT_MS,
      "数据加载超时，请稍后刷新重试"
    );
  } finally {
    release();
  }
}
