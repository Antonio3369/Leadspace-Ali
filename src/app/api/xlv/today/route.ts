import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getXlvFilterOptions } from "@/services/xlv/analytics";
import { getXlvTodayQueues } from "@/services/xlv/today";
import { assertCanViewXlv } from "@/services/xlv/xlv-scope";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewXlv(user);

    const { searchParams } = new URL(request.url);
    const managerName = searchParams.get("manager");
    const data = await getXlvTodayQueues(user, {
      managerName,
      operatorName: searchParams.get("operator"),
      search: searchParams.get("q"),
    });
    const filters = await getXlvFilterOptions(user, { managerName });

    return NextResponse.json({ ...data, filters });
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
