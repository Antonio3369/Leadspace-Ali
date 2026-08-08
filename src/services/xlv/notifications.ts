import { db } from "@/lib/db";
import {
  XLV_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
  summarizeFollowUpResult,
} from "@/lib/xlv-follow-up";
import { xlvMerchantLabel } from "@/lib/xlv-rules";
import type { SessionUser } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

export type XlvFollowUpNotificationPayload = {
  deviceSn: string;
  merchantName: string | null;
  activationMerchantName: string | null;
  operatorName: string;
  connectStatus: string | null;
  flags: string[];
  photoUrls: string[];
  followUpByName: string;
  followUpAt: Date;
};

/** 解析设备所属小绿盒经理账号；解析不到返回 null（关单仍成功） */
export async function resolveXlvDeviceManagerRecipient(device: {
  managerName: string;
}): Promise<string | null> {
  const managerName = device.managerName.trim();
  if (!managerName) return null;

  const account = await db.xlvMemberAccount.findFirst({
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

  return account?.id ?? null;
}

/** 小绿盒管理员端：全局 admin 账号（`/login/xlv`） */
export async function resolveXlvAdminUserId(): Promise<string | null> {
  const admin = await db.user.findFirst({
    where: { username: "admin", role: "DIRECTOR", status: "ACTIVE" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

function recipientMatchesActor(
  xlvMemberAccountId: string,
  followUpById: string
) {
  return xlvMemberAccountId === followUpById;
}

function buildFollowUpNotificationContent(opts: XlvFollowUpNotificationPayload) {
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

  return { title, body, meta };
}

async function createXlvFollowUpNotification(
  recipient:
    | { xlvMemberAccountId: string }
    | { userId: string },
  opts: XlvFollowUpNotificationPayload
) {
  const { title, body, meta } = buildFollowUpNotificationContent(opts);
  return db.xlvNotification.create({
    data: {
      type: XLV_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
      deviceSn: opts.deviceSn,
      title,
      body,
      meta,
      read: false,
      ...recipient,
    },
  });
}

/** 关单回告：所属经理 + admin 管理员各一份 */
export async function notifyFollowUpDoneRecipients(opts: {
  managerXlvMemberAccountId: string | null;
  followUpById: string;
  payload: XlvFollowUpNotificationPayload;
}) {
  const tasks: Promise<unknown>[] = [];

  if (
    opts.managerXlvMemberAccountId &&
    !recipientMatchesActor(opts.managerXlvMemberAccountId, opts.followUpById)
  ) {
    tasks.push(
      createXlvFollowUpNotification(
        { xlvMemberAccountId: opts.managerXlvMemberAccountId },
        opts.payload
      )
    );
  }

  const adminUserId = await resolveXlvAdminUserId();
  if (adminUserId && adminUserId !== opts.followUpById) {
    tasks.push(createXlvFollowUpNotification({ userId: adminUserId }, opts.payload));
  }

  await Promise.all(tasks);
}

function recipientWhere(user: SessionUser): Prisma.XlvNotificationWhereInput {
  if (user.role === "DIRECTOR") {
    return { userId: user.id };
  }
  if (user.authRealm === "xlv" && user.role === "MANAGER") {
    return { xlvMemberAccountId: user.id };
  }
  return { id: "__none__" };
}

export function canViewXlvFollowUpNotifications(user: SessionUser) {
  return user.role === "MANAGER" || user.role === "DIRECTOR";
}

export async function countUnreadXlvNotifications(user: SessionUser) {
  if (!canViewXlvFollowUpNotifications(user)) return 0;
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
  if (!canViewXlvFollowUpNotifications(user)) return;
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
