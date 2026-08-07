"use client";

import type { XlvManagerStat } from "@/services/xlv/analytics";

export function XlvManagerRiskPanel({
  rows,
  onPickManager,
  onPickAlert,
}: {
  rows: XlvManagerStat[];
  onPickManager: (managerName: string) => void;
  onPickAlert: (
    managerName: string,
    alert: "single_silence" | "dormant"
  ) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#fafbfc]">
        <h2 className="text-sm font-semibold text-[#111827]">经理风险概览</h2>
        <p className="text-xs text-[#94a3b8] mt-0.5">点击数字可下钻到对应名单</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-[#f8fafc] text-[#64748b]">
            <tr>
              <th className="px-4 py-2 text-left font-medium">经理</th>
              <th className="px-4 py-2 text-left font-medium">设备</th>
              <th className="px-4 py-2 text-left font-medium">单笔沉默</th>
              <th className="px-4 py-2 text-left font-medium">沉睡</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.managerName} className="border-t border-[#f1f5f9] hover:bg-[#f8fafc]/60">
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onPickManager(row.managerName)}
                    className="font-medium text-[#2563eb] hover:text-[#1d4ed8] text-left"
                  >
                    {idx < 3 && row.singleSilence + row.dormant > 0 ? (
                      <span className="mr-1">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                      </span>
                    ) : null}
                    {row.managerName}
                  </button>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{row.total}</td>
                <td className="px-4 py-2.5">
                  {row.singleSilence > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        onPickAlert(row.managerName, "single_silence")
                      }
                      className="font-semibold tabular-nums text-[#dc2626] hover:underline"
                    >
                      {row.singleSilence}
                    </button>
                  ) : (
                    <span className="text-[#cbd5e1]">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {row.dormant > 0 ? (
                    <button
                      type="button"
                      onClick={() => onPickAlert(row.managerName, "dormant")}
                      className="font-semibold tabular-nums text-[#d97706] hover:underline"
                    >
                      {row.dormant}
                    </button>
                  ) : (
                    <span className="text-[#cbd5e1]">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
