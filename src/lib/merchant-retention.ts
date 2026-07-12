/** 商户数据保留窗口：含本月共 3 个月，删除拓展日期早于此时间的记录 */
export function getMerchantRetentionCutoff(now = new Date()): Date {
  const year = now.getFullYear();
  const month = now.getMonth();
  return new Date(year, month - 2, 1, 0, 0, 0, 0);
}

export function formatRetentionLabel(cutoff: Date): string {
  const y = cutoff.getFullYear();
  const m = cutoff.getMonth() + 1;
  return `保留 ${y}年${m}月及之后拓展的商户`;
}
