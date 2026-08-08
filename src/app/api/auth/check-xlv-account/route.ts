import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canSignIn } from "@/lib/account-lifecycle";
import { canLogin } from "@/lib/permissions";
import { findXlvMemberByUsername } from "@/services/xlv/member-accounts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    if (!username) {
      return NextResponse.json({ ok: false, code: "INVALID", message: "请输入账号" });
    }

    const member = await findXlvMemberByUsername(username);
    if (member) {
      if (!canLogin(member.status)) {
        return NextResponse.json({
          ok: false,
          code: "DISABLED",
          message: "账号已停用，无法登录",
        });
      }
      if (!canSignIn(member.accountLifecycle, member.passwordHash)) {
        return NextResponse.json({
          ok: false,
          code: "NOT_ENABLED",
          message: "账号尚未开通，请先导入组织名册",
        });
      }
      return NextResponse.json({ ok: true });
    }

    const user = await db.user.findUnique({
      where: { username },
      select: {
        passwordHash: true,
        status: true,
        accountLifecycle: true,
        role: true,
      },
    });

    if (!user || user.role !== "DIRECTOR") {
      return NextResponse.json({ ok: false, code: "INVALID", message: "账号或密码错误" });
    }

    if (!canLogin(user.status)) {
      return NextResponse.json({
        ok: false,
        code: "DISABLED",
        message: "账号已停用，无法登录",
      });
    }

    if (!canSignIn(user.accountLifecycle, user.passwordHash)) {
      return NextResponse.json({
        ok: false,
        code: "NOT_ENABLED",
        message: "账号尚未开通",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[check-xlv-account]", err);
    return NextResponse.json(
      { ok: false, code: "ERROR", message: "服务异常，请稍后重试" },
      { status: 500 }
    );
  }
}
