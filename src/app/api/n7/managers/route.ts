import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  getN7ManagerLeaderboard,
  type N7LeaderboardSortKey,
} from "@/services/n7/analytics";

/** 经理排行仅管理员；经理端首页走队员排行接口 */
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "DIRECTOR") {
      return NextResponse.json(
        { error: "仅管理员可查看经理排行" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sortKey = (searchParams.get("sortKey") ??
      "expandCount") as N7LeaderboardSortKey;
    const order = searchParams.get("order") === "asc" ? "asc" : "desc";

    const data = await getN7ManagerLeaderboard({
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      yearMonth: searchParams.get("month"),
      sortKey,
      order,
      search: searchParams.get("search"),
    });

    return NextResponse.json(data);
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
