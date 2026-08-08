import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { parseXlvAlertKind, parseXlvQualificationStatus } from "@/lib/xlv-rules";
import {
  getXlvDashboardDevicesPage,
  XLV_DASHBOARD_PAGE_SIZE,
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

    const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
    const limitRaw = Number(searchParams.get("limit") ?? String(XLV_DASHBOARD_PAGE_SIZE));
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(limitRaw) ? limitRaw : XLV_DASHBOARD_PAGE_SIZE)
    );

    const page = await getXlvDashboardDevicesPage(user, {
      alert,
      managerName,
      operatorName,
      search,
      qualificationStatus,
      offset,
      limit,
    });

    return NextResponse.json({
      devices: page.devices,
      matchedCount: page.total,
      hasMore: page.hasMore,
      offset,
      limit,
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
