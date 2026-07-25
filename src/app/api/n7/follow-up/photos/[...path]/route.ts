import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { absolutePathForFollowUpPhoto } from "@/services/n7/follow-up-photos";

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
    await requireSessionUser();
    const { path: parts } = await context.params;
    const relative = (parts ?? []).map(decodeURIComponent).join("/");
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
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}
