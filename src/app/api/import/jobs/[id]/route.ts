import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canImportExcel, canLogin } from "@/lib/permissions";
import { getHeavyImportJob, presentHeavyImportJob } from "@/services/import/heavy-import-job";

export const GET = auth(async (request, context) => {
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

    const { id } = await context.params;
    const job = await getHeavyImportJob(id);
    if (!job) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    if (job.uploadedById !== user.id && user.role !== "DIRECTOR") {
      return NextResponse.json({ error: "无权查看该任务" }, { status: 403 });
    }

    const presented = presentHeavyImportJob(job);

    return NextResponse.json({
      id: presented.id,
      kind: presented.kind,
      fileName: presented.fileName,
      status: presented.status,
      progress: presented.progress,
      message: presented.message,
      errorMessage: presented.errorMessage,
      result: presented.result,
      completedAt: presented.completedAt,
      updatedAt: presented.updatedAt,
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
