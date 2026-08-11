import { db } from "@/lib/db";
import {
  N7_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
  N7_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW,
  summarizeFollowUpResult,
} from "@/lib/n7-follow-up";
import type { SessionUser } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

function followUpReviewPreview(note: string, max = 80) {
  const trimmed = note.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/** 解析设备所属经理账号；解析不到返回 null（关单仍成功） */
export async function resolveDeviceManagerUserId(device: {
  managerUserId: string | null;
  managerName: string;
  salesUserId: string | null;
}): Promise<string | null> {
  if (device.managerUserId) return device.managerUserId;

  if (device.managerName.trim()) {
    const byName = await db.user.findFirst({
      where: {
        role: "MANAGER",
        status: "ACTIVE",
        name: device.managerName.trim(),
      },
      select: { id: true },
    });
    if (byName) return byName.id;
  }

  if (device.salesUserId) {
    const sales = await db.user.findUnique({
      where: { id: device.salesUserId },
      select: { managerId: true },
    });
    if (sales?.managerId) return sales.managerId;
  }

  return null;
}

/** 解析设备所属队员账号；解析不到返回 null */
export async function resolveDeviceOperatorUserId(device: {
  salesUserId: string | null;
  operatorName: string;
  managerName: string;
  followUpById?: string | null;
}): Promise<string | null> {
  if (device.salesUserId) return device.salesUserId;
  if (device.followUpById) {
    const actor = await db.user.findUnique({
      where: { id: device.followUpById },
      select: { id: true, role: true, status: true },
    });
    if (actor?.role === "SALES" && actor.status === "ACTIVE") return actor.id;
  }

  const operatorName = device.operatorName.trim();
  const managerName = device.managerName.trim();
  if (!operatorName) return null;

  const byName = await db.user.findFirst({
    where: {
      role: "SALES",
      status: "ACTIVE",
      name: operatorName,
      ...(managerName
        ? { manager: { name: managerName } }
        : {}),
    },
    select: { id: true },
  });
  return byName?.id ?? null;
}

export async function notifyManagerFollowUpDone(opts: {
  managerUserId: string;
  deviceSn: string;
  storeName: string | null;
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
  const store = opts.storeName?.trim() || opts.deviceSn;
  const title = "队员已处理";
  const body = `${opts.followUpByName || opts.operatorName} · ${store} · ${summary}`;

  const meta: Prisma.InputJsonValue = {
    storeName: opts.storeName,
    operatorName: opts.operatorName,
    followUpByName: opts.followUpByName,
    connectStatus: opts.connectStatus,
    flags: opts.flags,
    photoUrls: opts.photoUrls,
    followUpAt: opts.followUpAt.toISOString(),
  };

  const row = await db.n7Notification.create({
    data: {
      userId: opts.managerUserId,
      type: N7_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
      deviceSn: opts.deviceSn,
      title,
      body,
      meta,
      read: false,
    },
  });

  // MVP-A：旁路企微外推；失败只打日志，不挡关单 / 站内通知
  try {
    const { notifyOutboundFollowUpDone } = await import(
      "@/services/n7/outbound-notifier"
    );
    await notifyOutboundFollowUpDone({
      deviceSn: opts.deviceSn,
      storeName: opts.storeName,
      operatorName: opts.operatorName,
      followUpByName: opts.followUpByName,
      summary,
    });
  } catch (err) {
    console.error("[n7-outbound] follow-up-done push failed", err);
  }

  return row;
}

export type N7FollowUpReviewNotificationPayload = {
  deviceSn: string;
  storeName: string | null;
  operatorName: string;
  reviewNote: string;
};

/** 经理/管理员反馈关单 → 通知所属队员 */
export async function notifyFollowUpReviewToOperator(opts: {
  operatorUserId: string;
  reviewerId: string;
  reviewerName: string;
  payload: N7FollowUpReviewNotificationPayload;
}) {
  if (opts.operatorUserId === opts.reviewerId) return;

  const store = opts.payload.storeName?.trim() || opts.payload.deviceSn;
  const body = `${opts.reviewerName} · ${store} · ${followUpReviewPreview(opts.payload.reviewNote)}`;

  await db.n7Notification.create({
    data: {
      userId: opts.operatorUserId,
      type: N7_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW,
      deviceSn: opts.payload.deviceSn,
      title: "经理反馈",
      body,
      meta: {
        storeName: opts.payload.storeName,
        operatorName: opts.payload.operatorName,
        reviewerName: opts.reviewerName,
        reviewNote: opts.payload.reviewNote,
        store,
      },
      read: false,
    },
  });
}

export function canViewN7Notifications(user: SessionUser) {
  return (
    user.role === "MANAGER" ||
    user.role === "DIRECTOR" ||
    user.role === "SALES"
  );
}

export async function countUnreadN7Notifications(user: SessionUser) {
  if (!canViewN7Notifications(user)) return 0;
  return db.n7Notification.count({
    where: { userId: user.id, read: false },
  });
}

export async function listN7Notifications(
  user: SessionUser,
  opts?: { limit?: number; unreadOnly?: boolean }
) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  return db.n7Notification.findMany({
    where: {
      userId: user.id,
      ...(opts?.unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markN7NotificationRead(
  user: SessionUser,
  notificationId: string
) {
  const row = await db.n7Notification.findFirst({
    where: { id: notificationId, userId: user.id },
  });
  if (!row) return null;
  if (row.read) return row;
  return db.n7Notification.update({
    where: { id: notificationId },
    data: { read: true, readAt: new Date() },
  });
}

export async function markN7NotificationsReadByDevice(
  user: SessionUser,
  deviceSn: string
) {
  if (!canViewN7Notifications(user)) return;
  const now = new Date();
  await db.n7Notification.updateMany({
    where: { userId: user.id, deviceSn, read: false },
    data: { read: true, readAt: now },
  });
}

export async function markAllN7NotificationsRead(user: SessionUser) {
  const now = new Date();
  await db.n7Notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true, readAt: now },
  });
}
