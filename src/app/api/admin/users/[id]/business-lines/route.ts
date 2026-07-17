import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  adminAccessErrorResponse,
  assertAdminCanManageTarget,
} from "@/lib/admin-user-access";
import {
  isBusinessLineId,
  normalizeBusinessLines,
  type BusinessLineId,
} from "@/lib/business-lines";

const schema = z.object({
  businessLines: z.array(z.string()).min(1, "请至少选择一条业务线"),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSessionUser();
    if (actor.role !== "DIRECTOR") {
      return NextResponse.json({ error: "仅管理员可设置业务线" }, { status: 403 });
    }

    const { id } = await params;
    const target = await assertAdminCanManageTarget(actor, id);

    if (target.role === "DIRECTOR") {
      return NextResponse.json(
        { error: "负责人默认拥有全部业务线，无需设置" },
        { status: 400 }
      );
    }

    const body = schema.parse(await request.json());
    const lines = normalizeBusinessLines(body.businessLines);
    if (lines.length === 0 || !body.businessLines.every(isBusinessLineId)) {
      return NextResponse.json(
        { error: "业务线仅支持：小蓝环、支付宝 N7，且至少选一项" },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id },
      data: { businessLines: lines },
      select: {
        id: true,
        name: true,
        username: true,
        businessLines: true,
      },
    });

    return NextResponse.json({
      user: {
        ...updated,
        businessLines: updated.businessLines as BusinessLineId[],
      },
    });
  } catch (err) {
    const accessErr = adminAccessErrorResponse(err);
    if (accessErr) {
      return NextResponse.json({ error: accessErr.error }, { status: accessErr.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "更新失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
