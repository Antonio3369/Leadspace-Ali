"use client";

import type { ReactNode } from "react";
import {
  getPresetRange,
  type LedgerDatePreset,
} from "@/lib/ledger-date";
import { NotionInput } from "@/components/ui/notion";

const PRESETS: { key: LedgerDatePreset; label: string }[] = [
  { key: "month", label: "本月" },
  { key: "lastMonth", label: "上月" },
];

export function N7DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
  trailing,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
  /** 放在结束日期右侧，如搜索框；手机端会换行全宽 */
  trailing?: ReactNode;
}) {
  function applyPreset(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    onChange(range);
  }

  function isPresetActive(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    return range.dateFrom === dateFrom && range.dateTo === dateTo;
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => {
          const active = isPresetActive(preset.key);
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.key)}
              className={`min-h-10 px-3 py-2 text-sm rounded-lg border transition-colors ${
                active
                  ? "bg-[#eff6ff] border-[#bfdbfe] text-[#2563eb] font-medium"
                  : "border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#2563eb]/40 hover:text-[#2563eb]"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 w-full sm:w-auto">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
          <span className="shrink-0 text-xs sm:text-sm">注册日期</span>
          <NotionInput
            type="date"
            value={dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
            className="min-h-10 w-full min-w-0 flex-1 sm:w-[10.5rem] sm:flex-none"
          />
          <span className="text-[#94a3b8] shrink-0">至</span>
          <NotionInput
            type="date"
            value={dateTo}
            onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
            className="min-h-10 w-full min-w-0 flex-1 sm:w-[10.5rem] sm:flex-none"
          />
        </div>
        {trailing ? (
          <div className="w-full sm:w-auto sm:self-end [&_input]:w-full [&_input]:min-h-10 [&_select]:w-full [&_select]:min-h-10">
            {trailing}
          </div>
        ) : null}
      </div>
    </div>
  );
}
