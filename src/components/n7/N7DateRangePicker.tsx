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
  dateLabel = "注册日期",
  trailing,
  compact = false,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
  /** 日期范围标签，如 N7 注册日 / 小绿盒跟进日 */
  dateLabel?: string;
  /** 放在结束日期右侧，如搜索框；手机端会换行全宽 */
  trailing?: ReactNode;
  /** 嵌入页头时略收紧间距 */
  compact?: boolean;
}) {
  function applyPreset(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    onChange(range);
  }

  function isPresetActive(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    return range.dateFrom === dateFrom && range.dateTo === dateTo;
  }

  const gap = compact ? "gap-2" : "gap-3";

  return (
    <div className={`flex flex-col items-stretch w-full sm:w-auto ${gap}`}>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => {
          const active = isPresetActive(preset.key);
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.key)}
              className={`min-h-11 px-3.5 py-2 text-sm rounded-lg border transition-colors ${
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

      <div className={`flex flex-col ${gap} w-full`}>
        <p className="text-xs font-medium text-[#64748b] sm:sr-only">{dateLabel}</p>

        {/* 手机：起止日期上下排列，便于点选 */}
        <div className="grid grid-cols-1 gap-2 w-full sm:hidden">
          <label className="space-y-1">
            <span className="text-xs text-[#94a3b8]">{dateLabel}起</span>
            <NotionInput
              type="date"
              value={dateFrom}
              onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
              className="min-h-11 w-full"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-[#94a3b8]">{dateLabel}止</span>
            <NotionInput
              type="date"
              value={dateTo}
              onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
              className="min-h-11 w-full"
            />
          </label>
        </div>

        {/* 桌面：单行 */}
        <div className="hidden sm:flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
          <span className="shrink-0">{dateLabel}</span>
          <NotionInput
            type="date"
            value={dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
            className="min-h-10 w-[10.5rem]"
          />
          <span className="text-[#94a3b8] shrink-0">至</span>
          <NotionInput
            type="date"
            value={dateTo}
            onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
            className="min-h-10 w-[10.5rem]"
          />
        </div>

        {trailing ? (
          <div className="w-full [&_input]:w-full [&_input]:min-h-11 [&_select]:w-full [&_select]:min-h-11">
            {trailing}
          </div>
        ) : null}
      </div>
    </div>
  );
}
