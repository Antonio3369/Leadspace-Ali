import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionAuthRealm } from "@/lib/auth-realm";
import { canLogin } from "@/lib/permissions";
import { confirmManagerReceipt } from "@/services/xlv/inventory/service";

export const POST = auth(async (request) => {
  const user = request.auth?.user;
  if (!user || !canLogin(user.status)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (user.role !== "MANAGER") {
    return NextResponse.json({ error: "仅经理可确认收货" }, { status: 403 });
  }

  const body = (await request.json()) as { deviceSns?: string[] };
  const deviceSns = body.deviceSns?.filter(Boolean) ?? [];
  if (deviceSns.length === 0) {
    return NextResponse.json({ error: "请选择待确认设备" }, { status: 400 });
  }

  const realm = sessionAuthRealm(user);
  const managerName =
    realm === "xlv"
      ? (user.xlvManagerName ?? user.name).trim()
      : user.name.trim();

  const result = await confirmManagerReceipt(deviceSns, managerName, user.id);
  return NextResponse.json(result);
});
