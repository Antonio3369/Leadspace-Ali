import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { needsOnboarding } from "@/lib/account-lifecycle";

const managerSchema = z.object({
  phone: z.string().min(11, "请输入有效手机号"),
  email: z.string().email("请输入有效邮箱"),
});

const salesSchema = z.object({
  identities: z
    .array(
      z.object({
        jobAccountName: z.string().min(1, "请填写作业账号"),
        personalPid: z.string().min(1, "请填写个人 PID"),
      })
    )
    .min(1, "请至少绑定一个 P 站身份"),
});

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!needsOnboarding(user.accountLifecycle)) {
      return NextResponse.json({ completed: true });
    }

    const profile = await db.userProfile.findUnique({ where: { userId: user.id } });
    const identities = await db.salesPlatformIdentity.findMany({
      where: { userId: user.id },
      select: { jobAccountName: true, personalPid: true },
    });

    return NextResponse.json({
      role: user.role,
      profile: profile ? { phone: profile.phone ?? "", email: profile.email ?? "" } : null,
      identities,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (!needsOnboarding(user.accountLifecycle)) {
      return NextResponse.json({ error: "已完成认证" }, { status: 400 });
    }

    const body = await request.json();

    if (user.role === "MANAGER") {
      const data = managerSchema.parse(body);
      await db.user.update({
        where: { id: user.id },
        data: {
          accountLifecycle: "ACTIVE",
          profile: {
            upsert: {
              create: { phone: data.phone, email: data.email },
              update: { phone: data.phone, email: data.email },
            },
          },
        },
      });
    } else if (user.role === "SALES") {
      const data = salesSchema.parse(body);
      const names = data.identities.map((i) => i.jobAccountName.trim());
      if (new Set(names).size !== names.length) {
        return NextResponse.json({ error: "作业账号不能重复" }, { status: 400 });
      }

      const conflicts = await db.salesPlatformIdentity.findMany({
        where: { jobAccountName: { in: names } },
        select: { jobAccountName: true, userId: true },
      });
      const taken = conflicts.find((c) => c.userId !== user.id);
      if (taken) {
        return NextResponse.json(
          { error: `作业账号「${taken.jobAccountName}」已被其他账号绑定` },
          { status: 400 }
        );
      }

      await db.$transaction([
        db.salesPlatformIdentity.deleteMany({ where: { userId: user.id } }),
        ...data.identities.map((identity) =>
          db.salesPlatformIdentity.create({
            data: {
              userId: user.id,
              jobAccountName: identity.jobAccountName.trim(),
              personalPid: identity.personalPid.trim(),
            },
          })
        ),
        db.user.update({
          where: { id: user.id },
          data: { accountLifecycle: "ACTIVE" },
        }),
      ]);
    } else {
      await db.user.update({
        where: { id: user.id },
        data: { accountLifecycle: "ACTIVE" },
      });
    }

    await signOut({ redirect: false });
    return NextResponse.json({ ok: true, redirectTo: "/login?onboarded=1" });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "认证失败";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
