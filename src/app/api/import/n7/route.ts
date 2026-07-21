import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { enqueueHeavyImport } from "@/services/import/heavy-import-job";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();

    if (!canImportExcel(user.role)) {
      return NextResponse.json({ error: "仅管理员可上传 Excel 数据" }, { status: 403 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            "上传文件过大或传输中断，无法解析。请确认文件小于 60MB，或去掉「原始表格」只保留加工表后再试。",
        },
        { status: 413 }
      );
    }
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传 .xlsx 文件" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json({ error: "仅支持 .xlsx 格式" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const queued = await enqueueHeavyImport({
      kind: "n7",
      fileName: file.name,
      buffer,
      uploadedById: user.id,
    });

    if ("error" in queued) {
      return NextResponse.json({ error: queued.error }, { status: queued.status });
    }

    return NextResponse.json(
      { async: true, jobId: queued.jobId, message: "已开始后台导入" },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (/Failed to parse body as FormData/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "上传文件过大或传输中断。请去掉「原始表格」只保留加工表，或拆成更小文件后再试。",
        },
        { status: 413 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
