import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  getXlvDashboardSummary,
  getXlvFilterOptions,
} from "@/services/xlv/analytics";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const managerName = searchParams.get("manager");

    const [summary, filters] = await Promise.all([
      getXlvDashboardSummary(user),
      getXlvFilterOptions(user, { managerName }),
    ]);

    return NextResponse.json({ summary, filters });
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
