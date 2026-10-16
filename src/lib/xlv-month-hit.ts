export type XlvMonthHitChannel = "fubei" | "leshua";

export function parseXlvMonthHitChannel(
  value: string | null | undefined
): XlvMonthHitChannel | null {
  if (value === "fubei" || value === "leshua") return value;
  return null;
}

/** 日期范围内的自然月（含首尾月） */
export function xlvCalendarMonthsInRange(dateFrom: string, dateTo: string) {
  const start = dateFrom.slice(0, 7).split("-").map(Number);
  const end = dateTo.slice(0, 7).split("-").map(Number);
  let y = start[0] ?? 0;
  let m = start[1] ?? 1;
  const endY = end[0] ?? y;
  const endM = end[1] ?? m;
  const months: { y: number; m: number }[] = [];
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ y, m });
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
    if (months.length > 24) break;
  }
  return months;
}

/** 整月写「10月达标」，不满一个月或跨月写「期间达标」 */
export function xlvMonthHitLabel(dateFrom: string, dateTo: string) {
  const months = xlvCalendarMonthsInRange(dateFrom, dateTo);
  const complete =
    months.length === 1 &&
    dateFrom.endsWith("-01") &&
    dateTo.endsWith(
      String(new Date(Date.UTC(months[0]!.y, months[0]!.m, 0)).getUTCDate()).padStart(2, "0")
    );
  if (complete) return `${months[0]!.m}月达标`;
  return "期间达标";
}
