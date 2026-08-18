import { db } from "@/lib/db";
import {
  XLV_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
  XLV_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW,
  summarizeFollowUpResult,
} from "@/lib/xlv-follow-up";
import { XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING } from "@/lib/xlv-withdraw";
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

/** 解析设备所属小绿盒队员账号 */
export async function resolveXlvDeviceOperatorRecipient(device: {
  operatorName: string;
  managerName: string;
}): Promise<string | null> {
  const operatorName = device.operatorName.trim();
  const managerName = device.managerName.trim();
  if (!operatorName) return null;

  const account = await db.xlvMemberAccount.findFirst({
    where: {
      memberRole: "OPERATOR",
      status: "ACTIVE",
      operatorName,
      managerName,
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

function followUpReviewPreview(note: string, max = 80) {
  const trimmed = note.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function buildFollowUpReviewNotificationBody(input: {
  reviewerName: string;
  merchantName: string | null;
  activationMerchantName: string | null;
  deviceSn: string;
  reviewNote: string;
}) {
  const store =
    xlvMerchantLabel({
      merchantName: input.merchantName,
      activationMerchantName: input.activationMerchantName,
    }) || input.deviceSn;
  return `${input.reviewerName} · ${store} · ${followUpReviewPreview(input.reviewNote)}`;
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
  const title = "队员已跟进";
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

  try {
    const { notifyXlvOutboundFollowUpDone } = await import(
      "./outbound-notifier"
    );
    await notifyXlvOutboundFollowUpDone(opts.payload);
  } catch (err) {
    console.error("[xlv-outbound] follow-up done:", err);
  }
}

export type XlvFollowUpReviewNotificationPayload = {
  deviceSn: string;
  merchantName: string | null;
  activationMerchantName: string | null;
  operatorName: string;
  reviewNote: string;
};

/** 经理/管理员反馈回访 → 通知所属队员 */
export async function notifyFollowUpReviewToOperator(opts: {
  operatorXlvMemberAccountId: string;
  reviewerId: string;
  reviewerName: string;
  payload: XlvFollowUpReviewNotificationPayload;
}) {
  if (opts.operatorXlvMemberAccountId === opts.reviewerId) return;

  const store =
    xlvMerchantLabel({
      merchantName: opts.payload.merchantName,
      activationMerchantName: opts.payload.activationMerchantName,
    }) || opts.payload.deviceSn;

  await db.xlvNotification.create({
    data: {
      type: XLV_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW,
      deviceSn: opts.payload.deviceSn,
      title: "经理反馈",
      body: buildFollowUpReviewNotificationBody({
        reviewerName: opts.reviewerName,
        merchantName: opts.payload.merchantName,
        activationMerchantName: opts.payload.activationMerchantName,
        deviceSn: opts.payload.deviceSn,
        reviewNote: opts.payload.reviewNote,
      }),
      meta: {
        merchantName: opts.payload.merchantName,
        activationMerchantName: opts.payload.activationMerchantName,
        operatorName: opts.payload.operatorName,
        reviewerName: opts.reviewerName,
        reviewNote: opts.payload.reviewNote,
        store,
      },
      read: false,
      xlvMemberAccountId: opts.operatorXlvMemberAccountId,
    },
  });
}

function recipientWhere(user: SessionUser): Prisma.XlvNotificationWhereInput {
  if (user.role === "DIRECTOR") {
    return { userId: user.id };
  }
  if (user.authRealm === "xlv" && user.role === "MANAGER") {
    return { xlvMemberAccountId: user.id };
  }
  if (user.authRealm === "xlv" && user.role === "SALES") {
    return { xlvMemberAccountId: user.id };
  }
  return { id: "__none__" };
}

export function canViewXlvNotifications(user: SessionUser) {
  return (
    user.role === "MANAGER" ||
    user.role === "DIRECTOR" ||
    user.role === "SALES"
  );
}

/** @deprecated use canViewXlvNotifications */
export function canViewXlvFollowUpNotifications(user: SessionUser) {
  return canViewXlvNotifications(user);
}

/** 撤机待确认须归属人显式同意/拒绝，不可因查看设备或批量已读而关闭 */
const autoReadExcludedTypes = [XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING] as const;

function withdrawRequestIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const id = (meta as Record<string, unknown>).requestId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** 历史 bug：查看设备曾误标已读；若撤机单仍为 pending 则自动恢复为待确认 */
export async function reopenMisreadWithdrawNotifications(user: SessionUser) {
  if (!canViewXlvNotifications(user)) return;
  if (user.authRealm !== "xlv") return;

  const misread = await db.xlvNotification.findMany({
    where: {
      ...recipientWhere(user),
      type: XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING,
      read: true,
    },
    select: { id: true, deviceSn: true },
  });
  if (misread.length === 0) return;

  const pendingSns = new Set(
    (
      await db.xlvWithdrawRequest.findMany({
        where: {
          deviceSn: { in: misread.map((m) => m.deviceSn) },
          status: "pending",
          recipientMemberAccountId: user.id,
        },
        select: { deviceSn: true },
      })
    ).map((r) => r.deviceSn)
  );

  const ids = misread.filter((m) => pendingSns.has(m.deviceSn)).map((m) => m.id);
  if (ids.length === 0) return;

  await db.xlvNotification.updateMany({
    where: { id: { in: ids } },
    data: { read: false, readAt: null },
  });
}

export type XlvNotificationWithdrawStatus = "pending" | "approved" | "rejected";

export async function loadWithdrawStatusByRequestId(
  requestIds: string[]
): Promise<Map<string, XlvNotificationWithdrawStatus>> {
  if (requestIds.length === 0) return new Map();
  const rows = await db.xlvWithdrawRequest.findMany({
    where: { id: { in: requestIds } },
    select: { id: true, status: true },
  });
  return new Map(rows.map((r) => [r.id, r.status]));
}

export type EnrichedXlvNotification = Awaited<
  ReturnType<typeof db.xlvNotification.findMany>
>[number] & {
  withdrawStatus?: XlvNotificationWithdrawStatus | null;
  needsWithdrawAction?: boolean;
};

export async function countUnreadXlvNotifications(user: SessionUser) {
  if (!canViewXlvNotifications(user)) return 0;
  await reopenMisreadWithdrawNotifications(user);
  return db.xlvNotification.count({
    where: { ...recipientWhere(user), read: false },
  });
}

export async function listXlvNotifications(
  user: SessionUser,
  opts?: { limit?: number; unreadOnly?: boolean }
): Promise<EnrichedXlvNotification[]> {
  await reopenMisreadWithdrawNotifications(user);

  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const rows = await db.xlvNotification.findMany({
    where: {
      ...recipientWhere(user),
      ...(opts?.unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const withdrawRequestIds = rows
    .filter((r) => r.type === XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING)
    .map((r) => withdrawRequestIdFromMeta(r.meta))
    .filter((id): id is string => Boolean(id));

  const statusByRequestId = await loadWithdrawStatusByRequestId(withdrawRequestIds);

  return rows.map((row) => {
    if (row.type !== XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING) {
      return row;
    }
    const requestId = withdrawRequestIdFromMeta(row.meta);
    const withdrawStatus = requestId
      ? (statusByRequestId.get(requestId) ?? null)
      : null;
    return {
      ...row,
      withdrawStatus,
      needsWithdrawAction: withdrawStatus === "pending",
    };
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
  if (row.type === XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING) return row;
  return db.xlvNotification.update({
    where: { id: notificationId },
    data: { read: true, readAt: new Date() },
  });
}

export async function markXlvNotificationsReadByDevice(
  user: SessionUser,
  deviceSn: string
) {
  if (!canViewXlvNotifications(user)) return;
  const now = new Date();
  await db.xlvNotification.updateMany({
    where: {
      ...recipientWhere(user),
      deviceSn,
      read: false,
      type: { notIn: [...autoReadExcludedTypes] },
    },
    data: { read: true, readAt: now },
  });
}

export async function markAllXlvNotificationsRead(user: SessionUser) {
  const now = new Date();
  await db.xlvNotification.updateMany({
    where: {
      ...recipientWhere(user),
      read: false,
      type: { notIn: [...autoReadExcludedTypes] },
    },
    data: { read: true, readAt: now },
  });
}

export { recipientMatchesActor };
