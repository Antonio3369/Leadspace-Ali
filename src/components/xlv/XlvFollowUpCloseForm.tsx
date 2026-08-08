"use client";

import { useRef, useState } from "react";
import {
  connectStatusLabel,
  followUpFlagLabel,
  type XlvFollowUpConnectStatus,
  type XlvFollowUpFlag,
} from "@/lib/xlv-follow-up";
import {
  patchXlvDeviceFollowUp,
  uploadXlvFollowUpPhoto,
  xlvFollowUpPhotoSrc,
  type XlvFollowUpPatchResult,
} from "@/lib/xlv-follow-up-client";
import { NotionAlert, NotionButton, notion } from "@/components/ui/notion";
import { N7PhotoLightbox } from "@/components/n7/N7PhotoLightbox";

type Props = {
  deviceSn: string;
  done: boolean;
  note: string;
  connectStatus: string | null;
  flags: string[];
  photoUrls: string[];
  followUpAt: string | null;
  onChanged?: (next: XlvFollowUpPatchResult) => void;
};

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function XlvFollowUpCloseForm({
  deviceSn,
  done,
  note: initialNote,
  connectStatus: initialConnect,
  flags: initialFlags,
  photoUrls: initialPhotos,
  followUpAt,
  onChanged,
}: Props) {
  const [connectStatus, setConnectStatus] =
    useState<XlvFollowUpConnectStatus | null>(
      initialConnect === "connected" || initialConnect === "not_connected"
        ? initialConnect
        : null
    );
  const [flags, setFlags] = useState<XlvFollowUpFlag[]>(
    initialFlags.filter(
      (f): f is XlvFollowUpFlag => f === "unwilling" || f === "promised_use"
    )
  );
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialPhotos);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lightbox = previewSrc ? (
    <N7PhotoLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />
  ) : null;

  function toggleFlag(flag: XlvFollowUpFlag) {
    setFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const next = [...photoUrls];
      for (const file of Array.from(files)) {
        if (next.length >= 9) break;
        const saved = await uploadXlvFollowUpPhoto(deviceSn, file);
        next.push(saved.relativePath);
      }
      setPhotoUrls(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submitDone() {
    if (saving) return;
    if (!connectStatus) {
      setError("请选择已接通或未接通");
      return;
    }
    if (photoUrls.length < 1) {
      setError("请上传跟进图（至少一张）");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const json = await patchXlvDeviceFollowUp(deviceSn, {
        followUpDone: true,
        followUpNote: note.trim() || null,
        followUpConnectStatus: connectStatus,
        followUpFlags: flags,
        followUpPhotoUrls: photoUrls,
      });
      onChanged?.(json);
      setMessage("跟进成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const json = await patchXlvDeviceFollowUp(deviceSn, {
        followUpDone: false,
        followUpNote: note.trim() || null,
      });
      onChanged?.(json);
      setConnectStatus(null);
      setFlags([]);
      setPhotoUrls([]);
      setMessage("已改回待回访");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        {lightbox}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
            回访状态
          </p>
          <p className="mt-1 text-sm text-[#111827]">
            已回访
            {followUpAt ? ` · ${fmt(followUpAt)}` : ""}
          </p>
          <p className="mt-1 text-sm text-[#64748b]">
            {connectStatusLabel(initialConnect)}
            {initialFlags.length
              ? ` · ${initialFlags.map(followUpFlagLabel).join("、")}`
              : ""}
          </p>
          {initialNote ? (
            <p className="mt-1 text-sm text-[#64748b] whitespace-pre-wrap">
              {initialNote}
            </p>
          ) : null}
        </div>
        {initialPhotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {initialPhotos.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreviewSrc(xlvFollowUpPhotoSrc(p))}
                className="block h-16 w-16 overflow-hidden rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={xlvFollowUpPhotoSrc(p)}
                  alt="跟进图"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        <NotionButton
          type="button"
          disabled={saving}
          onClick={() => void reopen()}
        >
          {saving ? "保存中…" : "改回待回访"}
        </NotionButton>
        {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
        {message ? <NotionAlert tone="success">{message}</NotionAlert> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {lightbox}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          沉睡回访跟进
        </p>
        <p className="mt-1 text-xs text-[#94a3b8]">
          选择接通结果，可叠加标签，并上传跟进图（至少一张）后完成。
        </p>
      </div>

      <div>
        <p className="text-xs text-[#64748b] mb-1.5">接通结果（必选）</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["connected", "已接通"],
              ["not_connected", "未接通"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => setConnectStatus(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors disabled:opacity-50 ${
                connectStatus === value
                  ? "border-sky-300 bg-sky-50 text-sky-900"
                  : "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-[#64748b] mb-1.5">可叠加（选填）</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["unwilling", "不愿配合"],
              ["promised_use", "已答应继续使用"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => toggleFlag(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors disabled:opacity-50 ${
                flags.includes(value)
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-[#64748b] mb-1.5">跟进图（至少一张）</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {photoUrls.map((p) => (
            <div key={p} className="relative h-16 w-16">
              <button
                type="button"
                className="h-16 w-16 overflow-hidden rounded-lg border border-[#e2e8f0] p-0"
                onClick={() => setPreviewSrc(xlvFollowUpPhotoSrc(p))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={xlvFollowUpPhotoSrc(p)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-[#111827] text-[10px] text-white"
                onClick={() =>
                  setPhotoUrls((prev) => prev.filter((x) => x !== p))
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,.heic"
          multiple
          className="hidden"
          onChange={(e) => void onPickFiles(e.target.files)}
        />
        <NotionButton
          type="button"
          disabled={uploading || saving || photoUrls.length >= 9}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "上传中…" : "添加图片"}
        </NotionButton>
      </div>

      <div>
        <label className="block text-xs text-[#64748b] mb-1.5">
          备注（选填）
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="沟通结果、下次动作等"
          className={`${notion.input} w-full resize-y min-h-[56px]`}
        />
      </div>

      <NotionButton
        type="button"
        disabled={saving || uploading}
        onClick={() => void submitDone()}
      >
        {saving ? "保存中…" : "完成跟进"}
      </NotionButton>

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {message ? <NotionAlert tone="success">{message}</NotionAlert> : null}
    </div>
  );
}
