import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError, canExport } from "@/lib/permissions";
import type { N7Priority } from "@/lib/n7-rules";
import {
  assertCanViewN7,
  resolveN7ManagerKey,
} from "@/services/n7/n7-scope";
import { exportN7FollowUpExcel } from "@/services/export/n7-follow-up-exporter";

const PRIORITIES = new Set<N7Priority>(["P0", "P1", "P2", "P3"]);
const BEHAVIORS = new Set(["notSubscribed", "notCheckedIn", "notLit"]);

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewN7(user);
    if (!canExport(user.role, user.status)) {
      return NextResponse.json({ error: "当前账号不可导出" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const priorityRaw = searchParams.get("priority");
    const priority =
      priorityRaw && PRIORITIES.has(priorityRaw as N7Priority)
        ? (priorityRaw as N7Priority)
        : "all";
    const behaviorRaw = searchParams.get("behavior");
    const behavior =
      behaviorRaw && BEHAVIORS.has(behaviorRaw)
        ? (behaviorRaw as "notSubscribed" | "notCheckedIn" | "notLit")
        : null;

    const requestedManagerKey = searchParams.get("managerKey");
    const managerKey = resolveN7ManagerKey(
      user,
      requestedManagerKey ? decodeURIComponent(requestedManagerKey) : null
    );

    const staffKeyRaw = searchParams.get("staffKey");
    const staffKey = staffKeyRaw ? decodeURIComponent(staffKeyRaw) : null;

    const { buffer, filename } = await exportN7FollowUpExcel(user, {
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      yearMonth: searchParams.get("month"),
      priority,
      managerKey,
      staffKey,
      behavior,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "导出失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
