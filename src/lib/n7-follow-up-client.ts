import { followUpPhotoPublicUrl } from "@/lib/n7-follow-up";

export type N7FollowUpPatchResult = {
  followUpDone: boolean;
  followUpNote: string | null;
  followUpAt: string | null;
  followUpConnectStatus: string | null;
  followUpFlags: string[];
  followUpPhotoUrls: string[];
  /** 是否已给所属经理发提醒通知 */
  managerNotified: boolean;
};

/** 客户端更新设备处理状态（V1 关单） */
export async function patchN7DeviceFollowUp(
  deviceSn: string,
  body: {
    followUpDone: boolean;
    followUpNote?: string | null;
    followUpConnectStatus?: string | null;
    followUpFlags?: string[];
    followUpPhotoUrls?: string[];
  }
): Promise<N7FollowUpPatchResult> {
  const res = await fetch(`/api/n7/devices/${encodeURIComponent(deviceSn)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "保存失败");
  return {
    followUpDone: json.followUpDone,
    followUpNote: json.followUpNote,
    followUpAt: json.followUpAt,
    followUpConnectStatus: json.followUpConnectStatus ?? null,
    followUpFlags: json.followUpFlags ?? [],
    followUpPhotoUrls: json.followUpPhotoUrls ?? [],
    managerNotified: Boolean(json.managerNotified),
  };
}

/** 上传关单现场图，返回相对路径（写入 followUpPhotoUrls） */
export async function uploadN7FollowUpPhoto(
  deviceSn: string,
  file: File
): Promise<{ relativePath: string; url: string }> {
  const form = new FormData();
  form.set("deviceSn", deviceSn);
  form.set("file", file);
  const res = await fetch("/api/n7/follow-up/photos", {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "上传失败");
  return {
    relativePath: json.relativePath,
    url: json.url,
  };
}

export function n7FollowUpPhotoSrc(relativeOrUrl: string): string {
  if (relativeOrUrl.startsWith("/") || relativeOrUrl.startsWith("http")) {
    return relativeOrUrl;
  }
  return followUpPhotoPublicUrl(relativeOrUrl);
}
