import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { assertCanViewXlvDevice } from "@/services/xlv/xlv-scope";
import { saveFollowUpPhoto } from "@/services/xlv/follow-up-photos";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const form = await request.formData();
    const deviceSn = String(form.get("deviceSn") ?? "").trim();
    const file = form.get("file");

    if (!deviceSn) {
      return NextResponse.json({ error: "缺少 deviceSn" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }

    await assertCanViewXlvDevice(user, deviceSn);

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveFollowUpPhoto({
      deviceSn,
      fileName: file.name || "photo.jpg",
      buffer,
    });

    return NextResponse.json({
      ok: true,
      relativePath: saved.relativePath,
      url: saved.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "上传失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (
      message.includes("图片") ||
      message.includes("仅支持") ||
      message.includes("8MB")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[xlv follow-up photo]", message);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
