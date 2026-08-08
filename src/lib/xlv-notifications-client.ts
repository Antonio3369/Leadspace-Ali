/** 经理未读提醒变化：底栏角标 / 待办入口立刻刷新 */
export const XLV_NOTIFICATIONS_CHANGED = "xlv-notifications-changed";

export function emitXlvNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(XLV_NOTIFICATIONS_CHANGED));
}
