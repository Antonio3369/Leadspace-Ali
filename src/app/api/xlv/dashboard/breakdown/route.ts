import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { parseN7DateRange } from "@/lib/n7-date";
import { PermissionError } from "@/lib/permissions";
import { loadXlvPeriodBreakdown } from "@/services/xlv/period-breakdown";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const range = parseN7DateRange({
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    });
    if (!range.dateFrom || !range.dateTo) {
      return NextResponse.json({ error: "请选择有效日期范围" }, { status: 400 });
    }
    const breakdown = await loadXlvPeriodBreakdown(user, {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      managerName: searchParams.get("manager"),
    });
    return NextResponse.json(breakdown);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "加载失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
