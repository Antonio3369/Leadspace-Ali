import type { N7Priority } from "@/lib/n7-rules";
import { n7PriorityLabel } from "@/lib/n7-rules";

const TONE: Record<N7Priority, string> = {
  P0: "bg-red-50 text-red-700",
  P1: "bg-amber-50 text-amber-700",
  P2: "bg-orange-50 text-orange-700",
  P3: "bg-violet-50 text-violet-700",
};

/** 列表/详情：显示人话优先级，不展示 P0–P3 代号 */
export function N7PriorityBadge({ p }: { p: N7Priority | null | undefined }) {
  if (!p) return <span className="text-[#94a3b8]">—</span>;
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold ${TONE[p]}`}
    >
      {n7PriorityLabel(p)}
    </span>
  );
}
