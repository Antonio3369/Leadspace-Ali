import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING } from "@/lib/xlv-withdraw";

export async function createWithdrawPendingNotification(opts: {
  requestId: string;
  deviceSn: string;
  merchantName: string | null;
  storeName: string | null;
  recipientMemberAccountId: string;
}) {
  const store =
    opts.merchantName?.trim() ||
    opts.storeName?.trim() ||
    "未命名门店";
  const title = "撤机待确认";
  const body = `${opts.deviceSn} · ${store} · 运营已登记移机，请确认是否同意撤机`;

  const meta: Prisma.InputJsonValue = {
    requestId: opts.requestId,
    merchantName: opts.merchantName,
    storeName: opts.storeName,
  };

  await db.xlvNotification.create({
    data: {
      type: XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING,
      deviceSn: opts.deviceSn,
      title,
      body,
      meta,
      read: false,
      xlvMemberAccountId: opts.recipientMemberAccountId,
    },
  });

  try {
    const { notifyXlvOutboundWithdrawPending } = await import(
      "./outbound-notifier"
    );
    await notifyXlvOutboundWithdrawPending({
      deviceSn: opts.deviceSn,
      merchantName: opts.merchantName,
      storeName: opts.storeName,
    });
  } catch (err) {
    console.error("[xlv-outbound] withdraw pending:", err);
  }
}
