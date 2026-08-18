import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionAuthRealm } from "@/lib/auth-realm";
import { canLogin } from "@/lib/permissions";
import { listPendingReceipts } from "@/services/xlv/inventory/service";

export const GET = auth(async (request) => {
  const user = request.auth?.user;
  if (!user || !canLogin(user.status)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (user.role !== "MANAGER" && user.role !== "DIRECTOR") {
    return NextResponse.json({ error: "仅经理可查看待收货" }, { status: 403 });
  }

  const realm = sessionAuthRealm(user);
  const managerName =
    user.role === "DIRECTOR"
      ? new URL(request.url).searchParams.get("managerName")?.trim() ?? ""
      : realm === "xlv"
        ? (user.xlvManagerName ?? user.name).trim()
        : user.name.trim();

  if (!managerName) {
    return NextResponse.json({ items: [], managerName: "" });
  }

  const items = await listPendingReceipts(managerName);
  return NextResponse.json({
    managerName,
    items: items.map((d) => ({
      deviceSn: d.deviceSn,
      channel: d.channel,
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
});
