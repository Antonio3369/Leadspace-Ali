import type { XlvBoardRow } from "@/services/xlv/board";

export type XlvBoardViewSort = "compliance" | "pending" | "wake_rate";

export const XLV_BOARD_VIEW_OPTIONS = [
  { id: "compliance" as const, label: "看健康" },
  { id: "pending" as const, label: "该催谁" },
  { id: "wake_rate" as const, label: "跟进成效" },
] as const;

export function parseXlvBoardViewSort(
  raw: string | null | undefined
): XlvBoardViewSort {
  if (raw === "pending") return "pending";
  if (raw === "wake_rate" || raw === "follow_up") return "wake_rate";
  return "compliance";
}

export function compareXlvBoardViewRows(
  a: XlvBoardRow,
  b: XlvBoardRow,
  sort: XlvBoardViewSort
) {
  if (sort === "pending") {
    return (
      b.pendingFollowUpCount - a.pendingFollowUpCount ||
      b.singleSilenceCount - a.singleSilenceCount ||
      b.dormantCount - a.dormantCount
    );
  }
  if (sort === "wake_rate") {
    return (
      b.monthWakeUpRate - a.monthWakeUpRate ||
      b.monthWakeUpCount - a.monthWakeUpCount ||
      b.monthFollowUpCount - a.monthFollowUpCount
    );
  }
  return (
    b.complianceRate - a.complianceRate ||
    b.compliantCount - a.compliantCount ||
    b.qualifiedCount - a.qualifiedCount
  );
}
