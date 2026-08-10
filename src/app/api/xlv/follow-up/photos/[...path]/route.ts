import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { assertCanViewXlvDevice } from "@/services/xlv/xlv-scope";
import { absolutePathForFollowUpPhoto } from "@/services/xlv/follow-up-photos";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const user = await requireSessionUser();
    const { path: parts } = await context.params;
    const segments = parts ?? [];
    const deviceSn = segments[0] ? decodeURIComponent(segments[0]) : "";
    if (!deviceSn) {
      return NextResponse.json({ error: "图片路径无效" }, { status: 400 });
    }
    await assertCanViewXlvDevice(user, deviceSn);

    const relative = segments.map(decodeURIComponent).join("/");
    const abs = absolutePathForFollowUpPhoto(relative);
    if (!abs || !fs.existsSync(abs)) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    }

    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "设备不存在") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}
