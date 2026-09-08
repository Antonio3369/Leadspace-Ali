"use client";

import {
  XLV_BOARD_VIEW_OPTIONS,
  type XlvBoardViewSort,
} from "@/components/xlv/xlv-board-view-sort";

export function XlvBoardSortBar({
  sort,
  onChange,
  ariaLabel,
}: {
  sort: XlvBoardViewSort;
  onChange: (next: XlvBoardViewSort) => void;
  ariaLabel: string;
}) {
  const active = XLV_BOARD_VIEW_OPTIONS.find((item) => item.id === sort);

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-3 overflow-hidden rounded-[12px] border border-[#e2e8f0] bg-white"
        aria-label={ariaLabel}
        role="tablist"
      >
        {XLV_BOARD_VIEW_OPTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={sort === item.id}
            onClick={() => onChange(item.id)}
            className={`min-h-10 border-l border-[#e2e8f0] px-2 py-2 text-xs font-medium first:border-l-0 sm:text-sm ${
              sort === item.id
                ? "bg-[#2563eb] text-white"
                : "text-[#475569] hover:bg-[#f8fafc]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {active ? (
        <p className="px-0.5 text-xs leading-relaxed text-[#64748b]">
          {active.hint}
        </p>
      ) : null}
    </div>
  );
}
