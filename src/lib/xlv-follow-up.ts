/** 微信小绿盒沉睡回访关单：接通互斥 + 可叠加项 + 必传图 */

export const XLV_FOLLOW_UP_CONNECT = ["connected", "not_connected"] as const;
export type XlvFollowUpConnectStatus = (typeof XLV_FOLLOW_UP_CONNECT)[number];

export const XLV_FOLLOW_UP_FLAGS = ["unwilling", "promised_use"] as const;
export type XlvFollowUpFlag = (typeof XLV_FOLLOW_UP_FLAGS)[number];

export function connectStatusLabel(status: string | null | undefined): string {
  if (status === "connected") return "已接通";
  if (status === "not_connected") return "未接通";
  return "—";
}

export function followUpFlagLabel(flag: string): string {
  if (flag === "unwilling") return "不愿配合";
  if (flag === "promised_use") return "已答应继续使用";
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

/** 存库相对路径 → 对外 URL */
export function followUpPhotoPublicUrl(relativePath: string): string {
  const safe = relativePath.replace(/^\/+/, "");
  return `/api/xlv/follow-up/photos/${safe
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function isFollowUpConnectStatus(
  v: unknown
): v is XlvFollowUpConnectStatus {
  return (
    typeof v === "string" &&
    (XLV_FOLLOW_UP_CONNECT as readonly string[]).includes(v)
  );
}

export function normalizeFollowUpFlags(flags: unknown): XlvFollowUpFlag[] {
  if (!Array.isArray(flags)) return [];
  const allowed = new Set<string>(XLV_FOLLOW_UP_FLAGS);
  const out: XlvFollowUpFlag[] = [];
  for (const f of flags) {
    if (typeof f === "string" && allowed.has(f) && !out.includes(f as XlvFollowUpFlag)) {
      out.push(f as XlvFollowUpFlag);
    }
  }
  return out;
}
