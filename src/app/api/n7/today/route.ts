import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getN7TodayQueues } from "@/services/n7/analytics";
import {
  assertCanViewN7,
  resolveN7ManagerKey,
} from "@/services/n7/n7-scope";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewN7(user);

    const { searchParams } = new URL(request.url);
    const requestedManagerKey = searchParams.get("managerKey");

    const managerKey = resolveN7ManagerKey(
      user,
      requestedManagerKey ? decodeURIComponent(requestedManagerKey) : null
    );

    const data = await getN7TodayQueues({
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      yearMonth: searchParams.get("month"),
      managerKey,
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
