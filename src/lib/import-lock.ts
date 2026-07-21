/**
 * 防止大表导入并发把小规格机器打满。
 * 仅限制「导入类」重任务；正常看数/登录不受影响。
 */
let busy = false;
let holder: string | null = null;

export function tryAcquireImportLock(label: string): boolean {
  if (busy) return false;
  busy = true;
  holder = label;
  return true;
}

export function releaseImportLock(): void {
  busy = false;
  holder = null;
}

export function getImportLockHolder(): string | null {
  return holder;
}
