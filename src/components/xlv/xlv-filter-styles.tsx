import type { XlvAlertKind } from "@/lib/xlv-rules";

export function xlvFilterChipBaseClass() {
  return "inline-flex items-center rounded-lg border px-3 py-2 min-h-10 text-sm font-medium transition-colors";
}

export function xlvTabButtonClass(active: boolean) {
  return active
    ? "bg-[#111827] text-white border-[#111827]"
    : "bg-white text-[#64748b] border-[#eef2f7] hover:bg-[#f8fafc]";
}

export function xlvAlertButtonClass(
  alert: Exclude<XlvAlertKind, "all">,
  active: boolean
) {
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
