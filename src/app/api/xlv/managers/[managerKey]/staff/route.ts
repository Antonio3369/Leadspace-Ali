import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getXlvStaffBoard } from "@/services/xlv/board";

type Params = { params: Promise<{ managerKey: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { managerKey } = await params;
    const data = await getXlvStaffBoard(user, {
      managerKey: decodeURIComponent(managerKey),
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "加载失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
