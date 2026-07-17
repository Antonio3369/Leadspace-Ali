import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { assertCanViewXlh } from "@/services/xlh/xlh-scope";
import { getMemberStats } from "@/services/stats/analytics";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewXlh(user);
    const { searchParams } = new URL(request.url);

    const members = await getMemberStats(user, {
      search: searchParams.get("search") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });

    return NextResponse.json(members);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
