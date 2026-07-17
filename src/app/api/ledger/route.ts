import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { assertCanViewXlh } from "@/services/xlh/xlh-scope";
import { parseMultiSearchParam } from "@/lib/query-params";
import { getLedgerRecords } from "@/services/stats/analytics";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewXlh(user);
    const { searchParams } = new URL(request.url);

    const data = await getLedgerRecords(user, {
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("pageSize") ?? 20),
      sortBy: searchParams.get("sortBy") ?? "expandDate",
      sortOrder: (searchParams.get("sortOrder") as "asc" | "desc") ?? "desc",
      teamId: searchParams.get("teamId") ?? undefined,
      managerId: searchParams.get("managerId") ?? undefined,
      salesUserId: searchParams.get("salesUserId") ?? undefined,
      opportunityId: searchParams.get("opportunityId") ?? undefined,
      photoStatus: parseMultiSearchParam(searchParams, "photoStatus"),
      riskStatus: parseMultiSearchParam(searchParams, "riskStatus"),
      salesActivationStatus: parseMultiSearchParam(searchParams, "salesActivationStatus"),
      search: searchParams.get("search") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
