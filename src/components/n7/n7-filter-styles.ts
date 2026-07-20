import {
  N7_PRIORITY_LABELS,
  n7PriorityLabel,
  type N7Priority,
} from "@/lib/n7-rules";

export { n7PriorityLabel };

/** 界面/导出用人话；URL/API 仍用 P0–P3 */
export const N7_PRIORITY_FILTERS: {
  id: N7Priority;
  label: string;
  hint: string;
}[] = (["P0", "P1", "P2", "P3"] as const).map((id) => ({
  id,
  label: N7_PRIORITY_LABELS[id].label,
  hint: N7_PRIORITY_LABELS[id].hint,
}));

export function n7PriorityButtonClass(priority: N7Priority, active: boolean) {
  if (active) {
    switch (priority) {
      case "P0":
        return "bg-[#dc2626] text-white border-[#dc2626]";
      case "P1":
        return "bg-[#d97706] text-white border-[#d97706]";
      case "P2":
        return "bg-[#ea580c] text-white border-[#ea580c]";
      case "P3":
        return "bg-[#7c3aed] text-white border-[#7c3aed]";
    }
  }
  switch (priority) {
    case "P0":
      return "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
    case "P1":
      return "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100";
    case "P2":
      return "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100";
    case "P3":
      return "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100";
  }
}

export function n7TabButtonClass(active: boolean) {
  return active
    ? "bg-[#111827] text-white border-[#111827]"
    : "bg-white text-[#64748b] border-[#eef2f7] hover:bg-[#f8fafc]";
}

/** 手机端也够点的筛选芯片 */
export function n7FilterChipBaseClass() {
  return "rounded-lg border px-3 py-2 min-h-10 text-sm font-medium transition-colors";
}
