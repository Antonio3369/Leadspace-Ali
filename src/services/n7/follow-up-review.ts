import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { assertCanViewN7Device } from "@/services/n7/n7-scope";
import {
  notifyFollowUpReviewToOperator,
  resolveDeviceOperatorUserId,
} from "@/services/n7/notifications";

export function canSubmitN7FollowUpReview(user: SessionUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR";
}

export async function submitN7FollowUpReview(
  user: SessionUser,
  deviceSn: string,
  reviewNote: string
) {
  if (!canSubmitN7FollowUpReview(user)) {
    throw new PermissionError("仅经理或管理员可反馈关单");
  }

  await assertCanViewN7Device(user, deviceSn);

  const trimmed = reviewNote.trim();
  if (!trimmed) {
    throw new Error("请填写反馈意见");
  }
  if (trimmed.length > 2000) {
    throw new Error("反馈意见不能超过 2000 字");
  }

  const existing = await db.n7DeviceRecord.findUnique({
    where: { deviceSn },
    select: {
      followUpDone: true,
      storeName: true,
      operatorName: true,
      managerName: true,
      salesUserId: true,
      followUpById: true,
    },
  });
  if (!existing) {
    throw new Error("设备不存在");
  }
  if (!existing.followUpDone) {
    throw new Error("队员尚未完成关单，暂不可反馈");
  }

  const updated = await db.n7DeviceRecord.update({
    where: { deviceSn },
    data: {
      followUpReviewNote: trimmed,
      followUpReviewAt: new Date(),
      followUpReviewById: user.id,
      followUpReviewByName: user.name,
    },
    select: {
      deviceSn: true,
      storeName: true,
      operatorName: true,
      managerName: true,
      salesUserId: true,
      followUpReviewNote: true,
      followUpReviewAt: true,
      followUpReviewByName: true,
      followUpById: true,
    },
  });

  const operatorUserId = await resolveDeviceOperatorUserId(updated);
  if (operatorUserId && operatorUserId !== user.id) {
    await notifyFollowUpReviewToOperator({
      operatorUserId,
      reviewerId: user.id,
      reviewerName: user.name,
      payload: {
        deviceSn: updated.deviceSn,
        storeName: updated.storeName,
        operatorName: updated.operatorName,
        reviewNote: trimmed,
      },
    });
  }

  return {
    followUpReviewNote: updated.followUpReviewNote,
    followUpReviewAt: updated.followUpReviewAt?.toISOString() ?? null,
    followUpReviewByName: updated.followUpReviewByName,
  };
}
