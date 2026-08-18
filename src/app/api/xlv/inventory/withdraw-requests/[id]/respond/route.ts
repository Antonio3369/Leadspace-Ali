import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionAuthRealm } from "@/lib/auth-realm";
import { canLogin } from "@/lib/permissions";
import {
  approveWithdrawRequest,
  rejectWithdrawRequest,
} from "@/services/xlv/inventory/withdraw-request";

export const POST = auth(async (request, ctx) => {
  const user = request.auth?.user;
  if (!user || !canLogin(user.status)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (sessionAuthRealm(user) !== "xlv") {
    return NextResponse.json({ error: "请使用小绿盒账号登录" }, { status: 403 });
  }
  if (user.role !== "MANAGER" && user.role !== "SALES") {
    return NextResponse.json({ error: "仅经理或队员可确认撤机" }, { status: 403 });
  }

  const params = await ctx.params;
  const requestId = params.id?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "缺少申请 ID" }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "无效请求" }, { status: 400 });
  }

  const action = body.action?.trim();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action 须为 approve 或 reject" }, { status: 400 });
  }

  const result =
    action === "approve"
      ? await approveWithdrawRequest(requestId, user.id)
      : await rejectWithdrawRequest(requestId, user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    action,
    deviceSn: result.deviceSn,
  });
});
