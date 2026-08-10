import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canImportExcel, canLogin } from "@/lib/permissions";
import { enqueueHeavyImport } from "@/services/import/heavy-import-job";

/** 接收文件后尽快返回 jobId，实际导入在后台执行（大表上传+落盘可能需数分钟） */
export const maxDuration = 600;

export const POST = auth(async (request) => {
  try {
    const user = request.auth?.user;
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (!canLogin(user.status)) {
      return NextResponse.json({ error: "账号不可用" }, { status: 403 });
    }

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
            "上传文件过大或传输中断，请确认文件小于 100MB 后重试。",
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
      kind: "xlv",
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
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "账号不可用" }, { status: 403 });
    }
    if (/Failed to parse body as FormData/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "上传文件过大或传输中断，请确认文件小于 100MB 后重试。",
        },
        { status: 413 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
