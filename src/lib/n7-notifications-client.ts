/** 经理未读提醒变化：底栏角标 / 待办入口立刻刷新 */
export const N7_NOTIFICATIONS_CHANGED = "n7-notifications-changed";

export function emitN7NotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(N7_NOTIFICATIONS_CHANGED));
}
