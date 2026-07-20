import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  getN7DeviceDetail,
  updateN7DeviceFollowUp,
} from "@/services/n7/analytics";
import { assertCanViewN7Device } from "@/services/n7/n7-scope";

const followUpSchema = z.object({
  followUpDone: z.boolean(),
  followUpNote: z.string().max(2000).nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ sn: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sn: raw } = await context.params;
    const sn = decodeURIComponent(raw);

    await assertCanViewN7Device(user, sn);

    const data = await getN7DeviceDetail(sn);
    if (!data) {
      return NextResponse.json({ error: "设备不存在" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "设备不存在") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sn: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sn: raw } = await context.params;
    const sn = decodeURIComponent(raw);

    await assertCanViewN7Device(user, sn);

    const body = followUpSchema.parse(await request.json());
    const updated = await updateN7DeviceFollowUp(sn, {
      followUpDone: body.followUpDone,
      ...(body.followUpNote !== undefined
        ? { followUpNote: body.followUpNote }
        : {}),
      followUpById: user.id,
    });

    return NextResponse.json({
      ok: true,
      followUpDone: updated.followUpDone,
      followUpNote: updated.followUpNote,
      followUpAt: updated.followUpAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "参数无效" },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "保存失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "设备不存在" || message.includes("Record to update not found")) {
      return NextResponse.json({ error: "设备不存在" }, { status: 404 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    // Prisma 长错误（含 turbopack 路径）压缩成可读提示
    if (/Unknown argument|does not exist|followUp/i.test(message)) {
      console.error("[n7 follow-up]", message);
      return NextResponse.json(
        {
          error:
            "处理状态字段未就绪：请重启本地开发服务（或生产环境执行 prisma db push 后重新部署）",
        },
        { status: 500 }
      );
    }
    console.error("[n7 follow-up]", message);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
