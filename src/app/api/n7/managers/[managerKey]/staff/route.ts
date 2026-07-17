import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  getN7StaffLeaderboard,
  type N7LeaderboardSortKey,
} from "@/services/n7/analytics";
import {
  assertCanViewN7,
  assertManagerOwnsKey,
} from "@/services/n7/n7-scope";

export async function GET(
  request: Request,
  context: { params: Promise<{ managerKey: string }> }
) {
  try {
    const user = await requireSessionUser();
    assertCanViewN7(user);

    const { managerKey: raw } = await context.params;
    const managerKey = decodeURIComponent(raw);
    assertManagerOwnsKey(user, managerKey);

    const { searchParams } = new URL(request.url);
    const sortKey = (searchParams.get("sortKey") ??
      "expandCount") as N7LeaderboardSortKey;
    const order = searchParams.get("order") === "asc" ? "asc" : "desc";

    const data = await getN7StaffLeaderboard({
      managerKey: user.role === "MANAGER" ? user.id : managerKey,
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
