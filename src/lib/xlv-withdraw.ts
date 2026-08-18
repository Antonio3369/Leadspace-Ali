export const XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING = "withdraw_pending";

export function xlvWithdrawNotificationTitle(type: string): string | null {
  if (type === XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING) return "撤机待确认";
  return null;
}
