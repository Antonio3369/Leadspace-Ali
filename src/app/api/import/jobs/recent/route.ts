import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canImportExcel, canLogin } from "@/lib/permissions";
import {
  listRecentHeavyImportJobs,
  type HeavyImportKind,
} from "@/services/import/heavy-import-job";

const KINDS = new Set<HeavyImportKind>(["personnel", "n7", "xlh-excel", "xlv"]);

export const GET = auth(async (request) => {
  try {
    const user = request.auth?.user;
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (!canLogin(user.status)) {
      return NextResponse.json({ error: "账号不可用" }, { status: 403 });
    }
    if (!canImportExcel(user.role)) {
      return NextResponse.json({ error: "无权查看" }, { status: 403 });
    }

    const kind = request.nextUrl.searchParams.get("kind");
    if (!kind || !KINDS.has(kind as HeavyImportKind)) {
      return NextResponse.json({ error: "无效的导入类型" }, { status: 400 });
    }

    const jobs = await listRecentHeavyImportJobs({
      kind: kind as HeavyImportKind,
      uploadedById: user.id,
      directorView: user.role === "DIRECTOR",
      take: 20,
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
