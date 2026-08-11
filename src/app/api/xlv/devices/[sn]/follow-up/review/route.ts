import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { submitXlvFollowUpReview } from "@/services/xlv/follow-up-review";

const reviewSchema = z.object({
  reviewNote: z.string().min(1).max(2000),
});

type Params = { params: Promise<{ sn: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { sn } = await params;
    const deviceSn = decodeURIComponent(sn);
    const body = reviewSchema.parse(await request.json());

    const updated = await submitXlvFollowUpReview(
      user,
      deviceSn,
      body.reviewNote
    );

    return NextResponse.json({ ok: true, ...updated });
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
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "设备不存在") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("请填写") ||
      message.includes("尚未完成") ||
      message.includes("不能超过")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (/Unknown argument|does not exist|followUpReview/i.test(message)) {
      console.error("[xlv follow-up review]", message);
      return NextResponse.json(
        {
          error:
            "回访反馈字段未就绪：请重启本地开发服务（或生产环境执行 prisma db push 后重新部署）",
        },
        { status: 500 }
      );
    }
    console.error("[xlv follow-up review]", message);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
