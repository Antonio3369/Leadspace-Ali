import { db } from "@/lib/db";
import {
  N7_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
  summarizeFollowUpResult,
} from "@/lib/n7-follow-up";
import type { Prisma } from "@/generated/prisma/client";

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

export async function countUnreadN7Notifications(userId: string) {
  return db.n7Notification.count({
    where: { userId, read: false },
  });
}

export async function listN7Notifications(
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean }
) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  return db.n7Notification.findMany({
    where: {
      userId,
      ...(opts?.unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markN7NotificationRead(
  userId: string,
  notificationId: string
) {
  const row = await db.n7Notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!row) return null;
  if (row.read) return row;
  return db.n7Notification.update({
    where: { id: notificationId },
    data: { read: true, readAt: new Date() },
  });
}

export async function markN7NotificationsReadByDevice(
  userId: string,
  deviceSn: string
) {
  const now = new Date();
  await db.n7Notification.updateMany({
    where: { userId, deviceSn, read: false },
    data: { read: true, readAt: now },
  });
}

export async function markAllN7NotificationsRead(userId: string) {
  const now = new Date();
  await db.n7Notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: now },
  });
}
