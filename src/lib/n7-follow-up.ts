/** N7 V1 关单：接通互斥 + 可叠加项 + 必传图 */

export const N7_FOLLOW_UP_CONNECT = ["connected", "not_connected"] as const;
export type N7FollowUpConnectStatus = (typeof N7_FOLLOW_UP_CONNECT)[number];

export const N7_FOLLOW_UP_FLAGS = ["unwilling", "promised_use"] as const;
export type N7FollowUpFlag = (typeof N7_FOLLOW_UP_FLAGS)[number];

export const N7_NOTIFICATION_TYPE_FOLLOW_UP_DONE = "sales_follow_up_done";
export const N7_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW = "manager_follow_up_review";

export function n7NotificationTitle(type: string): string {
  if (type === N7_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW) return "经理反馈";
  return "队员已处理";
}

export function connectStatusLabel(status: string | null | undefined): string {
  if (status === "connected") return "已接通";
  if (status === "not_connected") return "未接通";
  return "—";
}

export function followUpFlagLabel(flag: string): string {
  if (flag === "unwilling") return "不愿配合";
  if (flag === "promised_use") return "已答应使用达标";
  return flag;
}

export function summarizeFollowUpResult(input: {
  connectStatus: string | null | undefined;
  flags?: string[] | null;
  photoCount?: number;
}): string {
  const parts = [connectStatusLabel(input.connectStatus)];
  for (const f of input.flags ?? []) {
    parts.push(followUpFlagLabel(f));
  }
  if (input.photoCount != null && input.photoCount > 0) {
    parts.push(`${input.photoCount} 张图`);
  }
  return parts.filter(Boolean).join(" · ");
}

/** 存库相对路径 → 对外 URL（客户端/服务端皆可） */
export function followUpPhotoPublicUrl(
  relativePath: string,
  deviceSn?: string
): string {
  const safe = relativePath.replace(/^\/+/, "");
  const base = `/api/n7/follow-up/photos/${safe
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const sn = deviceSn?.trim();
  if (sn) {
    return `${base}?deviceSn=${encodeURIComponent(sn)}`;
  }
  return base;
}

export function isFollowUpConnectStatus(
  v: unknown
): v is N7FollowUpConnectStatus {
  return (
    typeof v === "string" &&
    (N7_FOLLOW_UP_CONNECT as readonly string[]).includes(v)
  );
}

export function normalizeFollowUpFlags(flags: unknown): N7FollowUpFlag[] {
  if (!Array.isArray(flags)) return [];
  const allowed = new Set<string>(N7_FOLLOW_UP_FLAGS);
  const out: N7FollowUpFlag[] = [];
  for (const f of flags) {
    if (typeof f === "string" && allowed.has(f) && !out.includes(f as N7FollowUpFlag)) {
      out.push(f as N7FollowUpFlag);
    }
  }
  return out;
}
