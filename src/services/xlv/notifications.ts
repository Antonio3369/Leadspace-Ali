import { db } from "@/lib/db";
import {
  XLV_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
  summarizeFollowUpResult,
} from "@/lib/xlv-follow-up";
import { xlvMerchantLabel } from "@/lib/xlv-rules";
import type { SessionUser } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

export type XlvNotificationRecipient =
  | { kind: "user"; userId: string }
  | { kind: "xlv_member"; xlvMemberAccountId: string };

/** 解析设备所属经理；解析不到返回 null（关单仍成功） */
export async function resolveXlvDeviceManagerRecipient(device: {
  managerUserId: string | null;
  managerName: string;
}): Promise<XlvNotificationRecipient | null> {
  if (device.managerUserId) {
    return { kind: "user", userId: device.managerUserId };
  }

  const managerName = device.managerName.trim();
  if (!managerName) return null;

  const byName = await db.xlvMemberAccount.findFirst({
    where: {
      memberRole: "MANAGER",
      status: "ACTIVE",
      OR: [
        { name: managerName },
        { managerName, operatorName: "" },
      ],
    },
    select: { id: true },
  });
  if (byName) {
    return { kind: "xlv_member", xlvMemberAccountId: byName.id };
  }

  const byUserName = await db.user.findFirst({
    where: {
      role: "MANAGER",
      status: "ACTIVE",
      name: managerName,
    },
    select: { id: true },
  });
  if (byUserName) {
    return { kind: "user", userId: byUserName.id };
  }

  return null;
}

function recipientMatchesActor(
  recipient: XlvNotificationRecipient,
  followUpById: string
) {
  if (recipient.kind === "user") return recipient.userId === followUpById;
  return recipient.xlvMemberAccountId === followUpById;
}

function recipientWhere(user: SessionUser): Prisma.XlvNotificationWhereInput {
  if (user.authRealm === "xlv" && user.role === "MANAGER") {
    return { xlvMemberAccountId: user.id };
  }
  return { userId: user.id };
}

export async function notifyManagerFollowUpDone(opts: {
  recipient: XlvNotificationRecipient;
  deviceSn: string;
  merchantName: string | null;
  activationMerchantName: string | null;
  operatorName: string;
  connectStatus: string | null;
  flags: string[];
  photoUrls: string[];
  followUpByName: string;
  followUpAt: Date;
}) {
  const summary = summarizeFollowUpResult({
    connectStatus: opts.connectStatus,
    flags: opts.flags,
    photoCount: opts.photoUrls.length,
  });
  const store =
    xlvMerchantLabel({
      merchantName: opts.merchantName,
      activationMerchantName: opts.activationMerchantName,
    }) || opts.deviceSn;
  const title = "队员已处理";
  const body = `${opts.followUpByName || opts.operatorName} · ${store} · ${summary}`;

  const meta: Prisma.InputJsonValue = {
    merchantName: opts.merchantName,
    activationMerchantName: opts.activationMerchantName,
    operatorName: opts.operatorName,
    followUpByName: opts.followUpByName,
    connectStatus: opts.connectStatus,
    flags: opts.flags,
    photoUrls: opts.photoUrls,
    followUpAt: opts.followUpAt.toISOString(),
  };

  return db.xlvNotification.create({
    data: {
      type: XLV_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
      deviceSn: opts.deviceSn,
      title,
      body,
      meta,
      read: false,
      ...(opts.recipient.kind === "user"
        ? { userId: opts.recipient.userId }
        : { xlvMemberAccountId: opts.recipient.xlvMemberAccountId }),
    },
  });
}

export async function countUnreadXlvNotifications(user: SessionUser) {
  return db.xlvNotification.count({
    where: { ...recipientWhere(user), read: false },
  });
}

export async function listXlvNotifications(
  user: SessionUser,
  opts?: { limit?: number; unreadOnly?: boolean }
) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  return db.xlvNotification.findMany({
    where: {
      ...recipientWhere(user),
      ...(opts?.unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markXlvNotificationRead(
  user: SessionUser,
  notificationId: string
) {
  const row = await db.xlvNotification.findFirst({
    where: { id: notificationId, ...recipientWhere(user) },
  });
  if (!row) return null;
  if (row.read) return row;
  return db.xlvNotification.update({
    where: { id: notificationId },
    data: { read: true, readAt: new Date() },
  });
}

export async function markXlvNotificationsReadByDevice(
  user: SessionUser,
  deviceSn: string
) {
  const now = new Date();
  await db.xlvNotification.updateMany({
    where: { ...recipientWhere(user), deviceSn, read: false },
    data: { read: true, readAt: now },
  });
}

export async function markAllXlvNotificationsRead(user: SessionUser) {
  const now = new Date();
  await db.xlvNotification.updateMany({
    where: { ...recipientWhere(user), read: false },
    data: { read: true, readAt: now },
  });
}

export { recipientMatchesActor };
