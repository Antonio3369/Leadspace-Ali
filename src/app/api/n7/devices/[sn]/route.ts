import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  isFollowUpConnectStatus,
  normalizeFollowUpFlags,
} from "@/lib/n7-follow-up";
import {
  getN7DeviceDetail,
  updateN7DeviceFollowUp,
} from "@/services/n7/analytics";
import { assertCanViewN7Device } from "@/services/n7/n7-scope";
import { markN7NotificationsReadByDevice } from "@/services/n7/notifications";

const followUpSchema = z.object({
  followUpDone: z.boolean(),
  followUpNote: z.string().max(2000).nullable().optional(),
  followUpConnectStatus: z.string().nullable().optional(),
  followUpFlags: z.array(z.string()).optional(),
  followUpPhotoUrls: z.array(z.string().min(1).max(500)).max(9).optional(),
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

    // 经理打开详情即视为审阅，清该 SN 未读提醒
    if (user.role === "MANAGER" || user.role === "SALES") {
      await markN7NotificationsReadByDevice(user, sn);
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

    if (body.followUpDone) {
      if (!isFollowUpConnectStatus(body.followUpConnectStatus)) {
        return NextResponse.json(
          { error: "请选择已接通或未接通" },
          { status: 400 }
        );
      }
      const flags = normalizeFollowUpFlags(body.followUpFlags);
      if (flags.length < 1) {
        return NextResponse.json(
          { error: "请选择可叠加项（至少一项）" },
          { status: 400 }
        );
      }
      const note = body.followUpNote?.trim() ?? "";
      if (!note) {
        return NextResponse.json({ error: "请填写备注" }, { status: 400 });
      }
      const photos = body.followUpPhotoUrls ?? [];
      if (photos.length < 1) {
        return NextResponse.json(
          { error: "请至少上传 1 张现场图" },
          { status: 400 }
        );
      }
    }

    const flags = normalizeFollowUpFlags(body.followUpFlags);

    const updated = await updateN7DeviceFollowUp(sn, {
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
      managerNotified: updated.managerNotified,
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
