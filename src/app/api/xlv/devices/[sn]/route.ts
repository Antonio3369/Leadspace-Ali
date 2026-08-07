import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  isFollowUpConnectStatus,
  normalizeFollowUpFlags,
} from "@/lib/xlv-follow-up";
import { getXlvDeviceDetail } from "@/services/xlv/board";
import { updateXlvDeviceFollowUp } from "@/services/xlv/follow-up";
import { assertCanViewXlvDevice } from "@/services/xlv/xlv-scope";

const followUpSchema = z.object({
  followUpDone: z.boolean(),
  followUpNote: z.string().max(2000).nullable().optional(),
  followUpConnectStatus: z.string().nullable().optional(),
  followUpFlags: z.array(z.string()).optional(),
  followUpPhotoUrls: z.array(z.string().min(1).max(500)).max(9).optional(),
});

type Params = { params: Promise<{ sn: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { sn } = await params;
    const data = await getXlvDeviceDetail(user, decodeURIComponent(sn));
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "加载失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "设备不存在") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { sn } = await params;
    const deviceSn = decodeURIComponent(sn);

    await assertCanViewXlvDevice(user, deviceSn);

    const body = followUpSchema.parse(await request.json());

    if (body.followUpDone) {
      if (!isFollowUpConnectStatus(body.followUpConnectStatus)) {
        return NextResponse.json(
          { error: "请选择已接通或未接通" },
          { status: 400 }
        );
      }
      const photos = body.followUpPhotoUrls ?? [];
      if (photos.length < 1) {
        return NextResponse.json(
          { error: "请上传跟进图（至少一张）" },
          { status: 400 }
        );
      }
    }

    const flags = normalizeFollowUpFlags(body.followUpFlags);

    const updated = await updateXlvDeviceFollowUp(deviceSn, {
      followUpDone: body.followUpDone,
      ...(body.followUpNote !== undefined
        ? { followUpNote: body.followUpNote }
        : {}),
      followUpById: user.id,
      ...(body.followUpDone
        ? {
            followUpConnectStatus: body.followUpConnectStatus!,
            followUpFlags: flags,
            followUpPhotoUrls: body.followUpPhotoUrls ?? [],
          }
        : {
            followUpConnectStatus: null,
            followUpFlags: [],
            followUpPhotoUrls: [],
          }),
    });

    return NextResponse.json({
      ok: true,
      followUpDone: updated.followUpDone,
      followUpNote: updated.followUpNote,
      followUpAt: updated.followUpAt?.toISOString() ?? null,
      followUpConnectStatus: updated.followUpConnectStatus,
      followUpFlags: updated.followUpFlags,
      followUpPhotoUrls: updated.followUpPhotoUrls,
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
    if (
      message === "设备不存在" ||
      message.includes("Record to update not found")
    ) {
      return NextResponse.json({ error: "设备不存在" }, { status: 404 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (/Unknown argument|does not exist|followUp/i.test(message)) {
      console.error("[xlv follow-up]", message);
      return NextResponse.json(
        {
          error:
            "回访字段未就绪：请重启本地开发服务（或生产环境执行 prisma db push 后重新部署）",
        },
        { status: 500 }
      );
    }
    console.error("[xlv follow-up]", message);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
