"use client";

import { useState } from "react";
import { LEDGER_STATUS_LEGEND } from "@/lib/ledger-labels";

const DIMENSION_COLORS = [
  "border-blue-200 bg-blue-50",
  "border-amber-200 bg-amber-50",
  "border-green-200 bg-green-50",
] as const;

const DIMENSION_TITLE_COLORS = [
  "text-blue-900",
  "text-amber-900",
  "text-green-900",
] as const;

export function SalesStatusLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-[#f8fafc] text-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[#111827] hover:bg-[#f1f5f9]"
      >
        <span>
          <span className="font-medium">{LEDGER_STATUS_LEGEND.title}</span>
          <span className="ml-2 text-xs text-[#64748b]">
            {LEDGER_STATUS_LEGEND.subtitle} · 点击展开
          </span>
        </span>
        <span className="text-xs text-[#94a3b8]">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-[#eef2f7] px-3 py-3">
          <div className="grid gap-3 lg:grid-cols-3">
            {LEDGER_STATUS_LEGEND.dimensions.map((dimension, index) => (
              <div
                key={dimension.name}
                className={`rounded-md border px-3 py-2.5 ${DIMENSION_COLORS[index]}`}
              >
                <p className={`text-xs font-semibold ${DIMENSION_TITLE_COLORS[index]}`}>
                  {index + 1}. {dimension.name}
                </p>
                <p className="text-xs text-gray-600 mt-0.5 mb-2">{dimension.hint}</p>
                <ul className="space-y-1.5">
                  {dimension.options.map((option) => (
                    <li key={option.label} className="text-xs">
                      <span className="font-medium text-gray-800">{option.label}</span>
                      <span className="text-gray-500"> — {option.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">{LEDGER_STATUS_LEGEND.criteria}</p>
        </div>
      )}
    </div>
  );
}
