import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { canExport } from "@/lib/permissions";
import { parseTeamDetailSort } from "@/lib/team-details";
import { exportTeamDetailsExcel } from "@/services/export/team-details-exporter";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canExport(user.role, user.status)) {
      return NextResponse.json({ error: "当前账号不可导出" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { buffer, filename } = await exportTeamDetailsExcel(user, {
      search: searchParams.get("search") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      sortBy: parseTeamDetailSort(searchParams.get("sortBy")),
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message.includes("不可导出")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
