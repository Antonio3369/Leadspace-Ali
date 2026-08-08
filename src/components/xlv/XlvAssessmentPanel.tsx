"use client";

import type { XlvQualificationDetail } from "@/lib/xlv-rules";
import {
  XLV_MONTHLY_TXN_TARGET,
  XLV_MONTHLY_USER_TARGET,
  XLV_QUALIFICATION_HINTS,
  xlvQualificationGapLine,
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
          装机月（首笔）{firstTxnDate} · 最多考核两个自然月 ·
          下表按<strong>月内实际收款日</strong>汇总（与交易趋势一致）
        </p>
      ) : (
        <p className="text-xs text-amber-700">暂无首笔交易，尚未进入考核窗口</p>
      )}

      {detail.status !== "qualified" && detail.focusMonth ? (
        <div className="rounded-lg bg-[#f8fafc] border border-[#eef2f7] px-3 py-2.5 text-sm">
          <p className="text-xs text-[#94a3b8]">
            当前关注 · {detail.focusMonth.label}（{detail.focusMonth.period}）
          </p>
          <p className="mt-1 font-medium text-[#334155] tabular-nums">
            {detail.focusMonth.users == null && detail.focusMonth.txns == null
              ? "本月暂无收款"
              : `${detail.focusMonth.users ?? 0} 用户 · ${detail.focusMonth.txns ?? 0} 笔`}
          </p>
          <p className="mt-1 text-xs text-[#c41e3a]">{xlvQualificationGapLine(detail)}</p>
        </div>
      ) : null}

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
                return (
                <tr key={row.period} className="border-b border-[#f8fafc]">
                  <td className="py-2 pr-2">
                    <span className="text-[#64748b]">{row.label}</span>
                    <span className="ml-1 tabular-nums">{row.period}</span>
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
