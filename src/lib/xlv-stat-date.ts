/** 微信小绿盒「统计日期」：按中国日历日处理，避免 UTC 偏移导致 8/3、8/4 错位 */

import * as XLSX from "xlsx";

const TZ = "Asia/Shanghai";

/** 中国日历日 YYYY-MM-DD */
export function xlvStatDateKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** 入库用：统一为 UTC 零点，表示该日历日 */
export function normalizeXlvStatDate(value: Date | string): Date {
  const key = xlvStatDateKey(value);
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 首笔/统计日筛选用：与库内 UTC 零点日历日对齐 */
export function xlvCalendarDayRange(dateFrom: string, dateTo: string) {
  return {
    from: normalizeXlvStatDate(dateFrom),
    to: normalizeXlvStatDate(dateTo),
  };
}

/** 跟进时间等真实时点：按中国自然日起止，不跟服务器 TZ */
export function xlvShanghaiDateTimeRange(dateFrom: string, dateTo: string) {
  return {
    from: new Date(`${dateFrom}T00:00:00+08:00`),
    to: new Date(`${dateTo}T23:59:59.999+08:00`),
  };
}

export function xlvChinaMonthDateRange(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateFrom = `${year}-${pad2(month)}-01`;
  const dateTo = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  return { dateFrom, dateTo };
}

export function xlvCurrentChinaMonthDateRange(now = new Date()) {
  const [y, m] = xlvStatDateKey(now).split("-").map(Number);
  return xlvChinaMonthDateRange(y!, m!);
}

export function parseXlvStatDateFromCell(value: unknown): Date | null {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return normalizeXlvStatDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
    const s = String(Math.trunc(value));
    if (/^\d{8}$/.test(s)) {
      return new Date(
        Date.UTC(
          Number(s.slice(0, 4)),
          Number(s.slice(4, 6)) - 1,
          Number(s.slice(6, 8))
        )
      );
    }
  }

  const s = String(value).replace(/^\t+|\t+$/g, "").trim();
  if (/^\d{8}$/.test(s)) {
    return new Date(
      Date.UTC(
        Number(s.slice(0, 4)),
        Number(s.slice(4, 6)) - 1,
        Number(s.slice(6, 8))
      )
    );
  }

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizeXlvStatDate(parsed);
}
