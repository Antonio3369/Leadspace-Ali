import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canImportExcel, canLogin } from "@/lib/permissions";
import {
  getActiveHeavyImportJob,
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

    const job = await getActiveHeavyImportJob({
      kind: kind as HeavyImportKind,
      uploadedById: user.id,
      directorView: user.role === "DIRECTOR",
    });

    if (!job) {
      return NextResponse.json({ active: false, job: null });
    }

    return NextResponse.json({
      active: job.status === "PENDING" || job.status === "PROCESSING",
      job: {
        id: job.id,
        kind: job.kind,
        fileName: job.fileName,
        status: job.status,
        progress: job.progress,
        message: job.message,
        errorMessage: job.errorMessage,
        updatedAt: job.updatedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "账号不可用" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
