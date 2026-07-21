import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError, canImportExcel } from "@/lib/permissions";
import { assertCanViewXlh } from "@/services/xlh/xlh-scope";
import { enqueueHeavyImport } from "@/services/import/heavy-import-job";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    assertCanViewXlh(user);

    if (!canImportExcel(user.role)) {
      return NextResponse.json({ error: "仅管理员可上传 Excel 数据" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传 .xlsx 文件" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json({ error: "仅支持 .xlsx 格式" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const queued = await enqueueHeavyImport({
      kind: "xlh-excel",
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
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
