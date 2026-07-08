import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { canExport } from "@/lib/permissions";
import { parseMultiSearchParam } from "@/lib/query-params";
import { exportLedgerExcel } from "@/services/export/ledger-exporter";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!canExport(user.role, user.status)) {
      return NextResponse.json({ error: "当前账号不可导出" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { buffer, filename } = await exportLedgerExcel(user, {
      sortBy: searchParams.get("sortBy") ?? "expandDate",
      sortOrder: (searchParams.get("sortOrder") as "asc" | "desc") ?? "desc",
      teamId: searchParams.get("teamId") ?? undefined,
      salesUserId: searchParams.get("salesUserId") ?? undefined,
      opportunityId: searchParams.get("opportunityId") ?? undefined,
      photoStatus: searchParams.get("photoStatus") ?? undefined,
      riskStatus: parseMultiSearchParam(searchParams, "riskStatus"),
      salesActivationStatus: parseMultiSearchParam(searchParams, "salesActivationStatus"),
      search: searchParams.get("search") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
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
    if (message.includes("导出数据量过大")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
