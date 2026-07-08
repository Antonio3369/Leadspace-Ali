/** YYYY-MM-DD */
export function formatDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateFromParam(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

export function parseDateToParam(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999);
}

export function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(end) };
}

export function getLastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(end) };
}

export function getRecentDaysRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(end) };
}

export type LedgerDatePreset = "month" | "lastMonth" | "30d" | "90d" | "all" | "custom";

export function getPresetRange(preset: LedgerDatePreset) {
  switch (preset) {
    case "month":
      return getCurrentMonthRange();
    case "lastMonth":
      return getLastMonthRange();
    case "30d":
      return getRecentDaysRange(30);
    case "90d":
      return getRecentDaysRange(90);
    case "all":
      return { dateFrom: "", dateTo: "" };
    default:
      return getCurrentMonthRange();
  }
}

export function formatDateRangeLabel(dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return "全部时间";
  if (dateFrom && dateTo) return `${dateFrom} 至 ${dateTo}`;
  if (dateFrom) return `${dateFrom} 起`;
  return `至 ${dateTo}`;
}

/** YYYY-MM */
export function formatMonthParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getCurrentMonthParam(): string {
  return formatMonthParam(new Date());
}

/** 校验并归一化 URL 月份参数，无效时回退到当前月 */
export function resolveMonthParam(value?: string | null): string {
  const current = getCurrentMonthParam();
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return current;
  const [y, m] = value.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return current;
  return value;
}

export function getMonthRange(monthParam: string) {
  const resolved = resolveMonthParam(monthParam);
  const [y, m] = resolved.split("-").map(Number);
  const start = new Date(y!, m! - 1, 1, 0, 0, 0, 0);
  const end = new Date(y!, m!, 0, 23, 59, 59, 999);
  return {
    monthParam: resolved,
    label: `${y}年${m}月`,
    start,
    end,
    dateFrom: formatDateInput(start),
    dateTo: formatDateInput(end),
  };
}
