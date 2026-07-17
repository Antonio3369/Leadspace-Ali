import type { N7Priority } from "@/lib/n7-rules";

export const N7_PRIORITY_FILTERS: {
  id: N7Priority;
  label: string;
  hint: string;
}[] = [
  { id: "P0", label: "剩余≤2天", hint: "剩余 0/1/2 天，需立即催达标" },
  { id: "P1", label: "无动销", hint: "零动销且剩余 ≥6 天" },
  { id: "P2", label: "未订阅/打卡", hint: "未点亮 / 未订阅 / 未打卡" },
  { id: "P3", label: "预警", hint: "其他待跟进" },
];

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
