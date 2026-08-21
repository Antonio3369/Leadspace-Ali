import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getXlvDashboardPulseSummary } from "@/services/xlv/analytics";

export const maxDuration = 120;

export async function GET() {
  try {
    const user = await requireSessionUser();
    const pulse = await getXlvDashboardPulseSummary(user);
    return NextResponse.json(pulse);
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
