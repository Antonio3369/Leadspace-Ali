"use client";

import { useState } from "react";
import {
  patchXlvFollowUpReview,
  type XlvFollowUpReviewResult,
} from "@/lib/xlv-follow-up-client";
import { emitXlvNotificationsChanged } from "@/lib/xlv-notifications-client";
import { NotionAlert, NotionButton, notion } from "@/components/ui/notion";

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function XlvFollowUpReviewPanel({
  deviceSn,
  canReview,
  reviewNote: initialNote,
  reviewAt: initialAt,
  reviewByName: initialByName,
  onChanged,
}: {
  deviceSn: string;
  canReview: boolean;
  reviewNote: string | null;
  reviewAt: string | null;
  reviewByName: string | null;
  onChanged?: (next: XlvFollowUpReviewResult) => void;
}) {
  const [reviewNote, setReviewNote] = useState(initialNote ?? "");
  const [reviewAt, setReviewAt] = useState(initialAt);
  const [reviewByName, setReviewByName] = useState(initialByName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submitReview() {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const json = await patchXlvFollowUpReview(deviceSn, reviewNote);
      setReviewNote(json.followUpReviewNote ?? "");
      setReviewAt(json.followUpReviewAt);
      setReviewByName(json.followUpReviewByName);
      onChanged?.(json);
      emitXlvNotificationsChanged();
      setMessage("已发送反馈，队员将收到站内通知");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!canReview && !initialNote) return null;

  return (
    <div className="space-y-3 border-t border-[#eef2f7] pt-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          经理反馈
        </p>
        {initialNote && !canReview ? (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-sm text-amber-950 whitespace-pre-wrap">{initialNote}</p>
            <p className="mt-1 text-xs text-amber-800/80">
              {initialByName || "经理"}
              {initialAt ? ` · ${fmt(initialAt)}` : ""}
            </p>
          </div>
        ) : null}
      </div>

      {canReview ? (
        <>
          {initialNote ? (
            <p className="text-xs text-[#64748b] whitespace-pre-wrap">
              上次反馈：{initialNote}
              {initialAt ? `（${fmt(initialAt)}）` : ""}
            </p>
          ) : null}
          <div>
            <label className="block text-xs text-[#64748b] mb-2">
              反馈意见（将通知队员）
            </label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="说明回访哪里不规范、需要补充什么…"
              className={`${notion.input} w-full resize-y min-h-[72px] text-base sm:text-sm`}
            />
          </div>
          <NotionButton
            type="button"
            disabled={saving || !reviewNote.trim()}
            onClick={() => void submitReview()}
            className="w-full sm:w-auto min-h-11"
          >
            {saving ? "发送中…" : initialNote ? "更新反馈" : "发送反馈"}
          </NotionButton>
        </>
      ) : null}

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {message ? <NotionAlert tone="success">{message}</NotionAlert> : null}
    </div>
  );
}
