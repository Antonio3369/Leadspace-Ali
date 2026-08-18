import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getXlvFilterOptions } from "@/services/xlv/analytics";
import {
  getXlvFollowUpDevices,
  type XlvFollowFilter,
  type XlvFollowUpPriority,
} from "@/services/xlv/follow-up";
import { assertCanViewXlv } from "@/services/xlv/xlv-scope";
import type { XlvAlertKind } from "@/lib/xlv-rules";

export const maxDuration = 120;

const FOLLOW_FILTERS = new Set<XlvFollowFilter>(["pending", "done", "all"]);
const ALERT_FILTERS = new Set(["all", "single_silence", "dormant"]);
const PRIORITY_FILTERS = new Set<XlvFollowUpPriority>(["P0", "P1"]);

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewXlv(user);

    const { searchParams } = new URL(request.url);
    const followRaw = searchParams.get("follow") as XlvFollowFilter | null;
    const follow =
      followRaw && FOLLOW_FILTERS.has(followRaw) ? followRaw : "pending";
    const alertRaw = searchParams.get("alert");
    const alert =
      alertRaw && ALERT_FILTERS.has(alertRaw)
        ? (alertRaw as Exclude<XlvAlertKind, "all" | "active"> | "all")
        : "all";
    const priorityRaw = searchParams.get("priority");
    const priority = PRIORITY_FILTERS.has(priorityRaw as XlvFollowUpPriority)
      ? (priorityRaw as XlvFollowUpPriority)
      : null;

    const managerName = searchParams.get("manager");
    const [data, filters] = await Promise.all([
      getXlvFollowUpDevices(user, {
        follow,
        alert,
        priority,
        managerName,
        operatorName: searchParams.get("operator"),
        search: searchParams.get("q"),
      }),
      getXlvFilterOptions(user, { managerName }),
    ]);

    return NextResponse.json({ ...data, filters });
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
