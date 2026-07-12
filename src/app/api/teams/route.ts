import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { parseTeamDetailSort, rankTeamDetailRows } from "@/lib/team-details";
import { getTeamDetails } from "@/services/stats/analytics";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);

    const result = await getTeamDetails(user, {
      search: searchParams.get("search") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });

    const sortBy = parseTeamDetailSort(searchParams.get("sortBy"));
    const rows = rankTeamDetailRows(result.rows, sortBy);

    return NextResponse.json({
      ...result,
      sortBy,
      rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
