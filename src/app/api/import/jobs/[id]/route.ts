import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { getHeavyImportJob } from "@/services/import/heavy-import-job";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
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

    return NextResponse.json({
      id: job.id,
      kind: job.kind,
      fileName: job.fileName,
      status: job.status,
      progress: job.progress,
      message: job.message,
      errorMessage: job.errorMessage,
      result: job.resultJson,
      completedAt: job.completedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
