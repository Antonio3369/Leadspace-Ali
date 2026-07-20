/** 客户端更新设备处理状态 */
export async function patchN7DeviceFollowUp(
  deviceSn: string,
  body: { followUpDone: boolean; followUpNote?: string | null }
): Promise<{
  followUpDone: boolean;
  followUpNote: string | null;
  followUpAt: string | null;
}> {
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
  };
}
