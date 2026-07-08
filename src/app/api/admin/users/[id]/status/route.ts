import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  adminAccessErrorResponse,
  assertAdminCanManageTarget,
} from "@/lib/admin-user-access";
import { isProtectedFromDisable } from "@/lib/admin-user-permissions";

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSessionUser();
    const { id } = await params;
    const body = statusSchema.parse(await request.json());

    if (actor.id === id) {
      return NextResponse.json({ error: "不能修改自己的账号状态" }, { status: 400 });
    }

    const target = await assertAdminCanManageTarget(actor, id);

    if (isProtectedFromDisable(target.role)) {
      return NextResponse.json({ error: "该账号不可停用" }, { status: 400 });
    }

    if (target.status === "RESIGNED") {
      return NextResponse.json({ error: "离职账号请通过人事流程处理" }, { status: 400 });
    }

    if (body.status === "DISABLED" && !target.passwordHash) {
      return NextResponse.json({ error: "未开通账号无需停用" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id },
      data: { status: body.status },
      select: { id: true, username: true, name: true, status: true },
    });

    return NextResponse.json({ user: updated, requiresRelogin: true });
  } catch (err) {
    const accessErr = adminAccessErrorResponse(err);
    if (accessErr) {
      return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "操作失败";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "账号已停用" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
