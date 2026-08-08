"use client";

import type { XlvQualificationDetail } from "@/lib/xlv-rules";
import {
  XLV_MONTHLY_TXN_TARGET,
  XLV_MONTHLY_USER_TARGET,
  XLV_QUALIFICATION_HINTS,
  xlvQualificationMonthResultLabel,
} from "@/lib/xlv-rules";
import { XlvQualificationBadge } from "@/components/xlv/XlvQualificationBadge";

export function XlvAssessmentPanel({
  detail,
  firstTxnDate,
}: {
  detail: XlvQualificationDetail;
  firstTxnDate: string | null;
}) {
  return (
    <section className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[#111827]">考核进度</h2>
        <XlvQualificationBadge status={detail.status} />
        <span className="text-xs text-[#94a3b8]" title={XLV_QUALIFICATION_HINTS[detail.status]}>
          目标：月 {XLV_MONTHLY_USER_TARGET} 用户 + {XLV_MONTHLY_TXN_TARGET} 笔
        </span>
      </div>

      {firstTxnDate ? (
        <p className="text-xs text-[#64748b]">
          装机月 {firstTxnDate} · 最多两个自然月达标（每月 {XLV_MONTHLY_USER_TARGET}{" "}
          用户 + {XLV_MONTHLY_TXN_TARGET} 笔）
        </p>
      ) : (
        <p className="text-xs text-amber-700">暂无首笔交易，尚未进入考核窗口</p>
      )}

      {detail.months.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] text-xs">
            <thead>
              <tr className="text-left text-[#94a3b8] border-b border-[#f1f5f9]">
                <th className="py-2 pr-2">月份</th>
                <th className="py-2 pr-2">用户</th>
                <th className="py-2 pr-2">笔数</th>
                <th className="py-2">结果</th>
              </tr>
            </thead>
            <tbody>
              {detail.months.map((row) => {
                const result = xlvQualificationMonthResultLabel(row);
                const isFocus =
                  detail.focusMonth != null &&
                  detail.focusMonth.period === row.period &&
                  !row.met;
                return (
                  <tr
                    key={row.period}
                    className={`border-b border-[#f8fafc] ${
                      isFocus ? "bg-[#f8fafc]" : ""
                    }`}
                  >
                    <td className="py-2 pr-2">
                      <span className="text-[#64748b]">{row.label}</span>
                      <span className="ml-1 tabular-nums">{row.period}</span>
                      {isFocus && detail.status !== "qualified" ? (
                        <span className="ml-1.5 text-[10px] font-medium text-[#2563eb]">
                          当前
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{row.users ?? "—"}</td>
                    <td className="py-2 pr-2 tabular-nums">{row.txns ?? "—"}</td>
                    <td className="py-2">
                      <span
                        className={
                          result.tone === "success"
                            ? "text-emerald-700 font-medium"
                            : result.tone === "warn"
                              ? "text-amber-800"
                              : "text-[#cbd5e1]"
                        }
                      >
                        {result.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
