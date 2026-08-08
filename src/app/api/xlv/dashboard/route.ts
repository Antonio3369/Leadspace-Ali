import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { parseXlvAlertKind, parseXlvQualificationStatus } from "@/lib/xlv-rules";
import {
  getXlvDashboardDevicesPage,
  getXlvDashboardSummaryFast,
  getXlvFilterOptions,
  XLV_DASHBOARD_PAGE_SIZE,
} from "@/services/xlv/analytics";

/** 兼容旧客户端：summary + 首屏列表 */
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

    const listOpts = {
      alert,
      managerName,
      operatorName,
      search,
      qualificationStatus,
    };

    const [summary, page, filters] = await Promise.all([
      getXlvDashboardSummaryFast(user),
      getXlvDashboardDevicesPage(user, {
        ...listOpts,
        offset: 0,
        limit: XLV_DASHBOARD_PAGE_SIZE,
      }),
      getXlvFilterOptions(user, { managerName }),
    ]);

    return NextResponse.json({
      summary,
      devices: page.devices,
      matchedCount: page.total,
      hasMore: page.hasMore,
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
