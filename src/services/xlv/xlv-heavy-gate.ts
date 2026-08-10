/** 进程内串行执行小绿盒重查询，避免多 Tab/预取并发把 Node 打 OOM */

let gate: Promise<unknown> = Promise.resolve();

export async function withXlvHeavyGate<T>(fn: () => Promise<T>): Promise<T> {
  const result = gate.then(() => fn());
  gate = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
