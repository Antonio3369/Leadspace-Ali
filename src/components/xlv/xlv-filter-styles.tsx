import type { XlvDeviceAlertKind } from "@/lib/xlv-rules";

export function xlvFilterChipBaseClass() {
  return "inline-flex items-center rounded-lg border px-3 py-2 min-h-10 text-sm font-medium transition-colors";
}

export function xlvTabButtonClass(active: boolean) {
  return active
    ? "bg-[#111827] text-white border-[#111827]"
    : "bg-white text-[#64748b] border-[#eef2f7] hover:bg-[#f8fafc]";
}

export function xlvAlertButtonClass(
  alert: XlvDeviceAlertKind,
  active: boolean
): string {
  if (active) {
    switch (alert) {
      case "single_silence":
        return "bg-[#dc2626] text-white border-[#dc2626]";
      case "dormant":
        return "bg-[#d97706] text-white border-[#d97706]";
      case "active":
        return "bg-emerald-600 text-white border-emerald-600";
    }
  }
  switch (alert) {
    case "single_silence":
      return "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
    case "dormant":
      return "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100";
    case "active":
      return "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
  }
  return "";
}

export function xlvQualStatusButtonClass(
  status: "qualified" | "in_progress" | "invalid",
  active: boolean
): string {
  if (active) {
    switch (status) {
      case "qualified":
        return "bg-emerald-600 text-white border-emerald-600";
      case "in_progress":
        return "bg-sky-600 text-white border-sky-600";
      case "invalid":
        return "bg-slate-600 text-white border-slate-600";
    }
  }
  switch (status) {
    case "qualified":
      return "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
    case "in_progress":
      return "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100";
    case "invalid":
      return "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100";
  }
  return "";
}

export function xlvNeutralChipClass(active = false) {
  return active
    ? "bg-[#111827] text-white border-[#111827]"
    : "bg-white text-[#64748b] border-[#eef2f7] hover:bg-[#f8fafc]";
}

/** 团队看板排行：纯文字指标，无底色/边框 */
export function xlvBoardMetricBaseClass() {
  return "inline-flex items-baseline gap-1 text-xs leading-snug transition-colors";
}

export function xlvBoardMetricNeutralClass(active = false) {
  return active
    ? "text-[#334155] font-semibold"
    : "text-[#94a3b8] hover:text-[#64748b]";
}

export function xlvQualStatusTextClass(
  status: "qualified" | "in_progress" | "invalid",
  active: boolean
): string {
  if (active) {
    switch (status) {
      case "qualified":
        return "text-emerald-800 font-semibold";
      case "in_progress":
        return "text-sky-800 font-semibold";
      case "invalid":
        return "text-slate-700 font-semibold";
    }
  }
  switch (status) {
    case "qualified":
      return "text-emerald-700 hover:text-emerald-800";
    case "in_progress":
      return "text-sky-700 hover:text-sky-800";
    case "invalid":
      return "text-slate-500 hover:text-slate-600";
  }
  return "";
}

export function xlvAlertTextClass(
  alert: XlvDeviceAlertKind,
  active: boolean
): string {
  if (active) {
    switch (alert) {
      case "single_silence":
        return "text-red-800 font-semibold";
      case "dormant":
        return "text-amber-800 font-semibold";
      case "active":
        return "text-emerald-800 font-semibold";
    }
  }
  switch (alert) {
    case "single_silence":
      return "text-red-600 hover:text-red-700";
    case "dormant":
      return "text-amber-700 hover:text-amber-800";
    case "active":
      return "text-emerald-700 hover:text-emerald-800";
  }
  return "";
}

export function XlvFilterChipText({
  label,
  count,
  active = false,
}: {
  label: string;
  count: number | string;
  active?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={active ? "text-white/80 font-medium" : "opacity-90"}>
        {label}
      </span>
      <span
        className={`tabular-nums font-bold ${
          active ? "text-white" : "text-[#0f172a]"
        }`}
      >
        {count}
      </span>
    </span>
  );
}
