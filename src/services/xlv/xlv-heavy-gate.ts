/** 进程内串行执行小绿盒重查询，避免多 Tab/预取并发把 Node 打 OOM */

const HEAVY_GATE_TIMEOUT_MS = 120_000;

let gate: Promise<unknown> = Promise.resolve();

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
  const result = gate.then(() =>
    withTimeout(
      Promise.resolve().then(fn),
      HEAVY_GATE_TIMEOUT_MS,
      "数据加载超时，请稍后刷新重试"
    )
  );
  gate = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
