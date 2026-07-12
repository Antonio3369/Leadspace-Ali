import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENABLED_USER_DEFAULTS, MANAGER_ENABLED_LIFECYCLE } from "@/lib/account-lifecycle";
import {
  adminAccessErrorResponse,
  assertAdminCanManageTarget,
} from "@/lib/admin-user-access";
import { allocatePinyinUsername } from "@/lib/pinyin-username";

const enableSchema = z.object({
  password: z.string().min(6),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSessionUser();
    const { id } = await params;
    const body = enableSchema.parse(await request.json());

    const target = await assertAdminCanManageTarget(actor, id);

    if (target.role === "SALES") {
      return NextResponse.json(
        { error: "业务员为纯数据账号，不支持开通登录" },
        { status: 400 }
      );
    }

    if (target.accountLifecycle !== "IMPORTED" || target.passwordHash) {
      return NextResponse.json({ error: "该账号已开通或状态不可开通" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const accountLifecycle =
      actor.role === "DIRECTOR" && target.role === "MANAGER"
        ? MANAGER_ENABLED_LIFECYCLE
        : ENABLED_USER_DEFAULTS.accountLifecycle;

    const updated = await db.user.update({
      where: { id },
      data: {
        username: target.username,
        passwordHash,
        accountLifecycle,
        mustChangePassword: true,
      },
      select: { id: true, username: true, name: true, role: true, accountLifecycle: true },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    const accessErr = adminAccessErrorResponse(err);
    if (accessErr) {
      return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "开通失败";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "账号已停用" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
