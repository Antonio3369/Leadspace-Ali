import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { parseXlvAlertKind, parseXlvQualificationStatus } from "@/lib/xlv-rules";
import {
  getXlvDashboardSummary,
  getXlvDeviceList,
  getXlvFilterOptions,
  getXlvManagerStats,
} from "@/services/xlv/analytics";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const alert = parseXlvAlertKind(searchParams.get("alert"));
    const managerName = searchParams.get("manager");
    const operatorName = searchParams.get("operator");
    const search = searchParams.get("q");
    const qualificationStatus =
      alert !== "all"
        ? null
        : parseXlvQualificationStatus(searchParams.get("status"));

    const [summary, list, managers, filters] = await Promise.all([
      getXlvDashboardSummary(user),
      getXlvDeviceList(user, {
        alert,
        managerName,
        operatorName,
        search,
        qualificationStatus,
      }),
      getXlvManagerStats(user),
      getXlvFilterOptions(user, { managerName }),
    ]);

    return NextResponse.json({
      summary,
      devices: list.devices,
      matchedCount: list.total,
      managers,
      filters,
    });
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
