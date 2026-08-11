import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { xlvMerchantLabel } from "@/lib/xlv-rules";
import { assertCanViewXlvDevice } from "@/services/xlv/xlv-scope";
import {
  notifyFollowUpReviewToOperator,
  resolveXlvDeviceOperatorRecipient,
} from "@/services/xlv/notifications";

export function canSubmitXlvFollowUpReview(user: SessionUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR";
}

export async function submitXlvFollowUpReview(
  user: SessionUser,
  deviceSn: string,
  reviewNote: string
) {
  if (!canSubmitXlvFollowUpReview(user)) {
    throw new PermissionError("仅经理或管理员可反馈回访");
  }

  await assertCanViewXlvDevice(user, deviceSn);

  const trimmed = reviewNote.trim();
  if (!trimmed) {
    throw new Error("请填写反馈意见");
  }
  if (trimmed.length > 2000) {
    throw new Error("反馈意见不能超过 2000 字");
  }

  const existing = await db.xlvDeviceRecord.findUnique({
    where: { deviceSn },
    select: {
      followUpDone: true,
      merchantName: true,
      activationMerchantName: true,
      operatorName: true,
      managerName: true,
      followUpById: true,
    },
  });
  if (!existing) {
    throw new Error("设备不存在");
  }
  if (!existing.followUpDone) {
    throw new Error("队员尚未完成回访，暂不可反馈");
  }

  const updated = await db.xlvDeviceRecord.update({
    where: { deviceSn },
    data: {
      followUpReviewNote: trimmed,
      followUpReviewAt: new Date(),
      followUpReviewById: user.id,
      followUpReviewByName: user.name,
    },
    select: {
      deviceSn: true,
      merchantName: true,
      activationMerchantName: true,
      operatorName: true,
      managerName: true,
      followUpReviewNote: true,
      followUpReviewAt: true,
      followUpReviewByName: true,
      followUpById: true,
    },
  });

  const operatorId = await resolveXlvDeviceOperatorRecipient(updated);
  if (operatorId && operatorId !== user.id) {
    await notifyFollowUpReviewToOperator({
      operatorXlvMemberAccountId: operatorId,
      reviewerId: user.id,
      reviewerName: user.name,
      payload: {
        deviceSn: updated.deviceSn,
        merchantName: updated.merchantName,
        activationMerchantName: updated.activationMerchantName,
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
