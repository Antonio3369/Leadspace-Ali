"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentMonthParam } from "@/lib/ledger-date";

interface TeamsMonthPickerProps {
  month: string;
  monthLabel: string;
}

export function TeamsMonthPicker({ month, monthLabel }: TeamsMonthPickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!nextMonth || nextMonth === getCurrentMonthParam()) {
      params.delete("month");
    } else {
      params.set("month", nextMonth);
    }
    const qs = params.toString();
    router.push(qs ? `/xlh/teams?${qs}` : "/xlh/teams");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-gray-900">团队排行</h1>
      <div className="flex items-center gap-2">
        <label htmlFor="teams-month" className="text-sm text-gray-500">
          统计月份
        </label>
        <input
          id="teams-month"
          type="month"
          value={month}
          onChange={(e) => handleChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30 focus:border-[#165DFF]"
        />
        <span className="text-xs text-gray-400 hidden sm:inline">{monthLabel}</span>
      </div>
    </div>
  );
}
