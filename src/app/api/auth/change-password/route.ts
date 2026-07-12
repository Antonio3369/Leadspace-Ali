import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const changePasswordSchema = z.object({
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
      select: { mustChangePassword: true },
    });

    if (!user?.mustChangePassword) {
      return NextResponse.json({ error: "当前无需修改密码" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await db.user.update({
      where: { id: session.user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "修改失败" }, { status: 500 });
  }
}
