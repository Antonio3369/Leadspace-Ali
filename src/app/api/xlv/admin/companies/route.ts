import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { getXlvCompanyBoard } from "@/services/xlv/company-board";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";

function assertXlvAdmin(user: Awaited<ReturnType<typeof requireSessionUser>>) {
  if (!canAccessXlvWorkspace(user)) {
    return NextResponse.json({ error: "未开通微信小绿盒业务线" }, { status: 403 });
  }
  if (!canImportExcel(user.role)) {
    return NextResponse.json({ error: "仅管理员可查看分公司看板" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const denied = assertXlvAdmin(user);
    if (denied) return denied;

    const data = await getXlvCompanyBoard();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
