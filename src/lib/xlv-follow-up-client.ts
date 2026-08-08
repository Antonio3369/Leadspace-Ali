import { readResponseJson } from "@/lib/fetch-json";
import { followUpPhotoPublicUrl } from "@/lib/xlv-follow-up";

export type XlvFollowUpPatchResult = {
  followUpDone: boolean;
  followUpNote: string | null;
  followUpAt: string | null;
  followUpConnectStatus: string | null;
  followUpFlags: string[];
  followUpPhotoUrls: string[];
};

export async function patchXlvDeviceFollowUp(
  deviceSn: string,
  body: {
    followUpDone: boolean;
    followUpNote?: string | null;
    followUpConnectStatus?: string | null;
    followUpFlags?: string[];
    followUpPhotoUrls?: string[];
  }
): Promise<XlvFollowUpPatchResult> {
  const res = await fetch(`/api/xlv/devices/${encodeURIComponent(deviceSn)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readResponseJson<{ error?: string } & XlvFollowUpPatchResult>(
    res,
    "保存回访"
  );
  if (!res.ok) throw new Error(json.error || "保存失败");
  return {
    followUpDone: json.followUpDone,
    followUpNote: json.followUpNote,
    followUpAt: json.followUpAt,
    followUpConnectStatus: json.followUpConnectStatus ?? null,
    followUpFlags: json.followUpFlags ?? [],
    followUpPhotoUrls: json.followUpPhotoUrls ?? [],
  };
}

export async function uploadXlvFollowUpPhoto(
  deviceSn: string,
  file: File
): Promise<{ relativePath: string; url: string }> {
  const form = new FormData();
  form.set("deviceSn", deviceSn);
  form.set("file", file);
  const res = await fetch("/api/xlv/follow-up/photos", {
    method: "POST",
    body: form,
  });
  const json = await readResponseJson<{
    error?: string;
    relativePath?: string;
    url?: string;
  }>(res, "上传图片");
  if (!res.ok) throw new Error(json.error || "上传失败");
  if (!json.relativePath || !json.url) {
    throw new Error("上传失败：服务器未返回文件地址");
  }
  return {
    relativePath: json.relativePath,
    url: json.url,
  };
}

export function xlvFollowUpPhotoSrc(relativeOrUrl: string): string {
  if (relativeOrUrl.startsWith("/") || relativeOrUrl.startsWith("http")) {
    return relativeOrUrl;
  }
  return followUpPhotoPublicUrl(relativeOrUrl);
}
