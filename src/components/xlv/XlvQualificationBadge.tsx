"use client";

import type { XlvQualificationStatus } from "@/lib/xlv-rules";
import { XLV_QUALIFICATION_HINTS, XLV_QUALIFICATION_LABELS } from "@/lib/xlv-rules";

export function xlvQualificationBadgeClass(status: XlvQualificationStatus) {
  if (status === "qualified") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (status === "invalid") {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }
  return "bg-sky-50 text-sky-800 border-sky-200";
}

export function XlvQualificationBadge({
  status,
  compact = false,
}: {
  status: XlvQualificationStatus;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-md border font-semibold ${xlvQualificationBadgeClass(status)} ${
        compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
      }`}
      title={XLV_QUALIFICATION_HINTS[status]}
    >
      {XLV_QUALIFICATION_LABELS[status]}
    </span>
  );
}
