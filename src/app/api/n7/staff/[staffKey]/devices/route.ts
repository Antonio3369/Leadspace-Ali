import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getN7StaffDevices } from "@/services/n7/analytics";
import {
  assertCanViewN7,
  resolveN7ManagerKey,
} from "@/services/n7/n7-scope";

export async function GET(
  request: Request,
  context: { params: Promise<{ staffKey: string }> }
) {
  try {
    const user = await requireSessionUser();
    assertCanViewN7(user);

    const { staffKey: raw } = await context.params;
    const staffKey = decodeURIComponent(raw);
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab");
    const requestedManagerKey = searchParams.get("managerKey");

    const managerKey = resolveN7ManagerKey(
      user,
      requestedManagerKey ? decodeURIComponent(requestedManagerKey) : null
    );

    const data = await getN7StaffDevices({
      staffKey,
      managerKey,
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      yearMonth: searchParams.get("month"),
      tab:
        tab === "qualified" || tab === "all" || tab === "followUp"
          ? tab
          : "followUp",
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
