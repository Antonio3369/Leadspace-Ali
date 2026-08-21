import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getXlvDailyPerformance } from "@/services/xlv/daily";
import { assertCanViewXlv } from "@/services/xlv/xlv-scope";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewXlv(user);

    const { searchParams } = new URL(request.url);
    const data = await getXlvDailyPerformance(user, {
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      month: searchParams.get("month"),
    });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
