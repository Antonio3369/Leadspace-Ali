import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  adminAccessErrorResponse,
  assertAdminCanManageTarget,
} from "@/lib/admin-user-access";

const optionalOnboardingSchema = z
  .object({
    phone: z.string().min(11).optional(),
    email: z.string().email().optional(),
  })
  .optional();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSessionUser();
    const { id } = await params;

    let body: z.infer<typeof optionalOnboardingSchema> = undefined;
    try {
      const raw = await request.json();
      body = optionalOnboardingSchema.parse(raw);
    } catch {
      body = undefined;
    }

    const target = await assertAdminCanManageTarget(actor, id);

    if (target.role === "SALES") {
      return NextResponse.json(
        { error: "业务员须自行完成 P 站身份绑定，管理员无法代完成认证" },
        { status: 400 }
      );
    }

    if (target.accountLifecycle !== "PENDING_ONBOARDING") {
      return NextResponse.json({ error: "该账号无需认证或已完成认证" }, { status: 400 });
    }

    const phone = body?.phone?.trim() || undefined;
    const email = body?.email?.trim() || undefined;

    const updated = await db.user.update({
      where: { id },
      data: {
        accountLifecycle: "ACTIVE",
        ...(phone || email
          ? {
              profile: {
                upsert: {
                  create: { phone: phone ?? null, email: email ?? null },
                  update: {
                    ...(phone ? { phone } : {}),
                    ...(email ? { email } : {}),
                  },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        accountLifecycle: true,
        profile: { select: { phone: true, email: true } },
      },
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
    const message = err instanceof Error ? err.message : "认证失败";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "账号已停用" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
