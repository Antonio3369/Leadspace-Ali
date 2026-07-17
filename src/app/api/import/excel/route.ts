import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError, canImportExcel } from "@/lib/permissions";
import { assertCanViewXlh } from "@/services/xlh/xlh-scope";
import { importExcelFile } from "@/services/import/excel-importer";

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
    const result = await importExcelFile(buffer, file.name, user.id);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (/connection|Connection|closed the connection/i.test(message)) {
      return NextResponse.json(
        { error: "数据库连接中断，请稍后重试（沙箱环境可重启 npx prisma dev -d）" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
