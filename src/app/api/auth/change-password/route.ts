import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "密码至少 6 位"),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = changePasswordSchema.parse(await request.json());
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, passwordHash: true, mustChangePassword: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json({ error: "账号尚未开通" }, { status: 400 });
    }

    if (user.mustChangePassword) {
      const passwordHash = await bcrypt.hash(body.newPassword, 10);
      await db.user.update({
        where: { id: session.user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      // 返回 username 供前端用新密码静默重登，刷新 JWT（中间件不会再卡在改密页）
      return NextResponse.json({
        ok: true,
        forced: true,
        username: user.username,
      });
    }

    if (!body.currentPassword) {
      return NextResponse.json({ error: "请输入当前密码" }, { status: 400 });
    }

    const currentOk = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!currentOk) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await db.user.update({
      where: { id: session.user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "修改失败" }, { status: 500 });
  }
}
