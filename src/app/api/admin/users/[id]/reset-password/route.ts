import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  adminAccessErrorResponse,
  assertAdminCanManageTarget,
} from "@/lib/admin-user-access";

const resetPasswordSchema = z.object({
  password: z.string().min(6, "密码至少 6 位"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSessionUser();
    const { id } = await params;
    const body = resetPasswordSchema.parse(await request.json());

    const target = await assertAdminCanManageTarget(actor, id);

    if (!target.passwordHash) {
      return NextResponse.json({ error: "该账号尚未开通，请先开通账号" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    await db.user.update({
      where: { id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true, requiresRelogin: true });
  } catch (err) {
    const accessErr = adminAccessErrorResponse(err);
    if (accessErr) {
      return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "重置失败";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "账号已停用" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
