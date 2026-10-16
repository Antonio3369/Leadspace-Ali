import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { parseN7DateRange } from "@/lib/n7-date";
import { PermissionError } from "@/lib/permissions";
import { xlvCalendarDayRange } from "@/lib/xlv-stat-date";
import { parseXlvMonthHitChannel } from "@/lib/xlv-month-hit";
import { parseXlvAlertKind, parseXlvQualificationStatus } from "@/lib/xlv-rules";
import {
  getXlvDashboardDevicesPage,
  XLV_DASHBOARD_PAGE_SIZE,
} from "@/services/xlv/analytics";
import {
  loadXlvMonthTargetHits,
  xlvMonthHitSns,
} from "@/services/xlv/month-target";

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
    const monthHit = parseXlvMonthHitChannel(searchParams.get("hit"));
    const installLane = parseXlvMonthHitChannel(searchParams.get("lane"));
    const expandMonth =
      (searchParams.get("expand") === "month" || Boolean(installLane)) && !monthHit;
    const range = parseN7DateRange({
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    });
    const bounds =
      expandMonth && range.dateFrom && range.dateTo
        ? xlvCalendarDayRange(range.dateFrom, range.dateTo)
        : null;
    const expandFrom = bounds?.from ?? null;
    const expandTo = bounds?.to ?? null;
    const monthHitSns =
      monthHit && range.dateFrom && range.dateTo
        ? xlvMonthHitSns(
            await loadXlvMonthTargetHits(user, {
              dateFrom: range.dateFrom,
              dateTo: range.dateTo,
            }),
            monthHit
          )
        : undefined;

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
      expandFrom,
      expandTo,
      deviceSns: monthHitSns,
      channel: installLane === "fubei" ? "付呗" : installLane === "leshua" ? "乐刷" : null,
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
