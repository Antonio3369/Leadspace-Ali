import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { getChartData } from "@/services/stats/analytics";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") as "team" | "personal" | null;

    const data = await getChartData(user, { view: view ?? undefined });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (message.includes("无权")) return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
