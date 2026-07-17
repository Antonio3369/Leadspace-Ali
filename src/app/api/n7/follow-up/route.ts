import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getN7FollowUpDevices } from "@/services/n7/analytics";
import type { N7Priority } from "@/lib/n7-rules";
import {
  assertCanViewN7,
  resolveN7ManagerKey,
} from "@/services/n7/n7-scope";

const PRIORITIES = new Set<N7Priority>(["P0", "P1", "P2", "P3"]);

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewN7(user);

    const { searchParams } = new URL(request.url);
    const priorityRaw = searchParams.get("priority");
    const priority =
      priorityRaw && PRIORITIES.has(priorityRaw as N7Priority)
        ? (priorityRaw as N7Priority)
        : priorityRaw === "all"
          ? "all"
          : "all";
    const requestedManagerKey = searchParams.get("managerKey");

    const managerKey = resolveN7ManagerKey(
      user,
      requestedManagerKey ? decodeURIComponent(requestedManagerKey) : null
    );

    const data = await getN7FollowUpDevices({
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      yearMonth: searchParams.get("month"),
      priority,
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
