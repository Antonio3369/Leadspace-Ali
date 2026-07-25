import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { followUpPhotoPublicUrl } from "@/lib/n7-follow-up";
import {
  countUnreadN7Notifications,
  listN7Notifications,
  markAllN7NotificationsRead,
  markN7NotificationRead,
} from "@/services/n7/notifications";

function mapMetaPhotos(meta: unknown) {
  if (!meta || typeof meta !== "object") return meta;
  const m = meta as Record<string, unknown>;
  const urls = Array.isArray(m.photoUrls)
    ? m.photoUrls.filter((u): u is string => typeof u === "string")
    : [];
  return {
    ...m,
    photoUrls: urls.map((u) =>
      u.startsWith("/") || u.startsWith("http") ? u : followUpPhotoPublicUrl(u)
    ),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "MANAGER" && user.role !== "DIRECTOR") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get("countOnly") === "1") {
      const unread = await countUnreadN7Notifications(user.id);
      return NextResponse.json({ unread });
    }

    const unreadOnly = searchParams.get("unreadOnly") === "1";
    const limit = Number(searchParams.get("limit") || "50");
    const rows = await listN7Notifications(user.id, { unreadOnly, limit });
    const unread = await countUnreadN7Notifications(user.id);

    return NextResponse.json({
      unread,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        deviceSn: r.deviceSn,
        title: r.title,
        body: r.body,
        meta: mapMetaPhotos(r.meta),
        read: r.read,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "MANAGER" && user.role !== "DIRECTOR") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = patchSchema.parse(await request.json());
    if (body.all) {
      await markAllN7NotificationsRead(user.id);
      return NextResponse.json({ ok: true });
    }
    if (!body.id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }
    const row = await markN7NotificationRead(user.id, body.id);
    if (!row) {
      return NextResponse.json({ error: "提醒不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "参数无效" },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "保存失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
