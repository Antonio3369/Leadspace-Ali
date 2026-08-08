import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError, canExport } from "@/lib/permissions";
import type { XlvTodayPriority } from "@/lib/xlv-rules";
import { exportXlvFollowUpExcel } from "@/services/export/xlv-follow-up-exporter";
import type { XlvFollowFilter } from "@/services/xlv/follow-up";
import { assertCanViewXlv } from "@/services/xlv/xlv-scope";

const FOLLOW_FILTERS = new Set<XlvFollowFilter>(["pending", "done", "all"]);
const PRIORITIES = new Set<Extract<XlvTodayPriority, "P0" | "P1">>(["P0", "P1"]);

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewXlv(user);
    if (!canExport(user.role, user.status)) {
      return NextResponse.json({ error: "当前账号不可导出" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const followRaw = searchParams.get("follow");
    const follow =
      followRaw && FOLLOW_FILTERS.has(followRaw as XlvFollowFilter)
        ? (followRaw as XlvFollowFilter)
        : "pending";

    const priorityRaw = searchParams.get("priority");
    const priority =
      priorityRaw && PRIORITIES.has(priorityRaw as "P0" | "P1")
        ? (priorityRaw as "P0" | "P1")
        : null;

    const { buffer, filename } = await exportXlvFollowUpExcel(user, {
      follow,
      priority,
      managerName: searchParams.get("manager"),
      operatorName: searchParams.get("operator"),
      search: searchParams.get("q"),
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
