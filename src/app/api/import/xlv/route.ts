import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canImportExcel, canLogin } from "@/lib/permissions";
import { importXlvExcelFile } from "@/services/import/xlv-excel-importer";

/** 原始表行多、耗时长，同步导入最长等待 5 分钟 */
export const maxDuration = 300;

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
        { error: "上传文件过大或传输中断，请确认文件小于 60MB 后重试。" },
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
    const result = await importXlvExcelFile(buffer, file.name, user.id);

    if (result.status === "FAILED") {
      return NextResponse.json(
        { error: result.errors[0] || "导入失败" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "账号不可用" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
