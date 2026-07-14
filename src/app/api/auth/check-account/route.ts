import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canSignIn } from "@/lib/account-lifecycle";
import { canLogin, canRoleSignIn } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    if (!username) {
      return NextResponse.json({ ok: false, code: "INVALID", message: "请输入账号" });
    }

    const user = await db.user.findUnique({
      where: { username },
      select: { passwordHash: true, status: true, accountLifecycle: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ ok: false, code: "INVALID", message: "账号或密码错误" });
    }

    if (!canRoleSignIn(user.role)) {
      return NextResponse.json({
        ok: false,
        code: "NOT_LOGIN_ROLE",
        message: "业务员账号不支持登录，请使用经理或负责人账号",
      });
    }

    if (!canLogin(user.status)) {
      return NextResponse.json({ ok: false, code: "DISABLED", message: "账号已停用或离职，无法登录" });
    }

    if (!canSignIn(user.accountLifecycle, user.passwordHash)) {
      return NextResponse.json({
        ok: false,
        code: "NOT_ENABLED",
        message: "账号尚未开通，请联系管理员开通后再登录",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[check-account]", err);
    return NextResponse.json(
      { ok: false, code: "ERROR", message: "数据库连接异常，请稍后重试" },
      { status: 500 }
    );
  }
}
