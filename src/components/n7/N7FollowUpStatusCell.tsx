"use client";

import { useState, type MouseEvent } from "react";
import { patchN7DeviceFollowUp } from "@/lib/n7-follow-up-client";
import { N7FollowUpBadge } from "@/components/n7/N7FollowUpBadge";

export type N7FollowUpPatchResult = {
  followUpDone: boolean;
  followUpNote: string | null;
  followUpAt: string | null;
};

/** 列表行内：未处理时可一键标已处理；已处理显示角标（改回详情） */
export function N7FollowUpStatusCell({
  deviceSn,
  done,
  note,
  onChanged,
}: {
  deviceSn: string;
  done: boolean;
  note?: string | null;
  onChanged?: (next: N7FollowUpPatchResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function markDone(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || done) return;
    setBusy(true);
    setError("");
    try {
      const json = await patchN7DeviceFollowUp(deviceSn, {
        followUpDone: true,
      });
      onChanged?.(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "标记失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5 min-w-[4.5rem]">
      <div className="flex flex-wrap items-center gap-1.5">
        <N7FollowUpBadge done={done} note={note} />
        {!done && (
          <button
            type="button"
            disabled={busy}
            onClick={markDone}
            className="text-[0.7rem] font-medium text-[#2563eb] hover:text-[#1d4ed8] disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? "…" : "标已处理"}
          </button>
        )}
      </div>
      {error ? (
        <span className="text-[0.65rem] text-red-600 leading-tight">{error}</span>
      ) : null}
    </div>
  );
}
