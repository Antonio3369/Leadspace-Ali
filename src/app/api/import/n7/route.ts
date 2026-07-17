import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { importN7ExcelFile } from "@/services/import/n7-excel-importer";

/** 大表导入可能超过 1～2 分钟 */
export const maxDuration = 600;

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
    const result = await importN7ExcelFile(buffer, file.name, user.id);

    return NextResponse.json(result);
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
    if (/connection|Connection|closed the connection/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "数据库连接中断，请稍后重试（沙箱环境可重启 npx prisma dev -d）",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
