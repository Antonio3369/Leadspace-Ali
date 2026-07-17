import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { getN7DeviceDetail } from "@/services/n7/analytics";
import { assertCanViewN7Device } from "@/services/n7/n7-scope";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sn: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sn: raw } = await context.params;
    const sn = decodeURIComponent(raw);

    await assertCanViewN7Device(user, sn);

    const data = await getN7DeviceDetail(sn);
    if (!data) {
      return NextResponse.json({ error: "设备不存在" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "设备不存在") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
