/** N7 看板日期范围（按注册日 registeredAt） */

import {
  formatDateInput,
  getCurrentMonthRange as getLedgerCurrentMonthRange,
  parseDateFromParam,
  parseDateToParam,
} from "@/lib/ledger-date";

export function getMonthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to };
}

export function getCurrentMonthRange(now = new Date()): {
  from: Date;
  to: Date;
  year: number;
  month: number;
} {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { ...getMonthRange(year, month), year, month };
}

export function parseYearMonth(
  value: string | null | undefined,
  fallback = getCurrentMonthRange()
): { year: number; month: number; from: Date; to: Date } {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      return { year: y, month: m, ...getMonthRange(y, m) };
    }
  }
  return {
    year: fallback.year,
    month: fallback.month,
    from: fallback.from,
    to: fallback.to,
  };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type N7DateRange = {
  dateFrom: string;
  dateTo: string;
  from: Date | null;
  to: Date | null;
};

/** 优先 dateFrom/dateTo；兼容旧 month=YYYY-MM；皆空则默认本月 */
export function parseN7DateRange(opts: {
  dateFrom?: string | null;
  dateTo?: string | null;
  month?: string | null;
}): N7DateRange {
  const fromOk = !!opts.dateFrom && DATE_RE.test(opts.dateFrom);
  const toOk = !!opts.dateTo && DATE_RE.test(opts.dateTo);

  if (fromOk || toOk) {
    return {
      dateFrom: fromOk ? opts.dateFrom! : "",
      dateTo: toOk ? opts.dateTo! : "",
      from: fromOk ? parseDateFromParam(opts.dateFrom!) : null,
      to: toOk ? parseDateToParam(opts.dateTo!) : null,
    };
  }

  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    const ym = parseYearMonth(opts.month);
    return {
      dateFrom: formatDateInput(ym.from),
      dateTo: formatDateInput(ym.to),
      from: ym.from,
      to: ym.to,
    };
  }

  const cur = getLedgerCurrentMonthRange();
  return {
    dateFrom: cur.dateFrom,
    dateTo: cur.dateTo,
    from: parseDateFromParam(cur.dateFrom),
    to: parseDateToParam(cur.dateTo),
  };
}

export function readN7DateRangeFromSearchParams(searchParams: URLSearchParams): N7DateRange {
  return parseN7DateRange({
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    month: searchParams.get("month"),
  });
}

/** 写入 URL：用 dateFrom/dateTo，去掉旧 month */
export function applyN7DateRangeToParams(
  params: URLSearchParams,
  dateFrom: string,
  dateTo: string
) {
  params.delete("month");
  if (dateFrom) params.set("dateFrom", dateFrom);
  else params.delete("dateFrom");
  if (dateTo) params.set("dateTo", dateTo);
  else params.delete("dateTo");
}

export function n7DateRangeQuery(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams();
  applyN7DateRangeToParams(params, dateFrom, dateTo);
  return params.toString();
}
