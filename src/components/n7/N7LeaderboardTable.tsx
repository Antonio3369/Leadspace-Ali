"use client";

import Link from "next/link";

export interface N7BoardRow {
  rank: number;
  key: string;
  name: string;
  expandCount: number;
  qualifiedCount: number;
  qualifyRate: number;
  followUpCount: number;
  p0Count: number;
  notSubscribedCount: number;
  notCheckedInCount: number;
  notLitCount: number;
}

export type N7BoardMetric =
  | "followUp"
  | "p0"
  | "notSubscribed"
  | "notCheckedIn";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-bold text-amber-500">🥇 {rank}</span>;
  if (rank === 2) return <span className="font-bold text-gray-400">🥈 {rank}</span>;
  if (rank === 3) return <span className="font-bold text-orange-400">🥉 {rank}</span>;
  return <span className="text-[#94a3b8]">{rank}</span>;
}

function MetricCell({
  value,
  href,
  accent,
}: {
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const className = `px-4 py-3 text-right tabular-nums ${
    accent ? "font-semibold text-[#dc2626]" : ""
  }`;
  if (!href || value <= 0) {
    return <td className={className}>{value}</td>;
  }
  return (
    <td className={className}>
      <Link
        href={href}
        className="text-[#2563eb] hover:text-[#1d4ed8] hover:underline"
        title="查看对应明细"
      >
        {value}
      </Link>
    </td>
  );
}

export function N7SummaryStrip({
  totals,
  followUpHref,
  p0Href,
}: {
  totals: {
    expandCount: number;
    qualifiedCount: number;
    qualifyRate: number;
    followUpCount: number;
    p0Count: number;
  };
  /** 待跟进卡片下钻链接 */
  followUpHref?: string;
  /** P0 卡片下钻链接 */
  p0Href?: string;
}) {
  const items: Array<{
    label: string;
    value: string | number;
    href?: string;
    accent?: boolean;
    success?: boolean;
    valueClassName?: string;
  }> = [
    {
      label: "拓展 SN",
      value: totals.expandCount,
      valueClassName: "text-[#2563eb]",
    },
    { label: "已达标", value: totals.qualifiedCount, success: true },
    {
      label: "达标率",
      value: `${totals.qualifyRate.toFixed(1)}%`,
      valueClassName:
        totals.qualifyRate >= 75
          ? "text-[#00B42A]"
          : totals.qualifyRate >= 60
            ? "text-[#FF7D00]"
            : "text-[#F53F3F]",
    },
    { label: "待跟进", value: totals.followUpCount, href: followUpHref },
    {
      label: "剩余≤2天",
      value: totals.p0Count,
      href: p0Href,
      accent: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((item) => {
        const valueColor =
          item.valueClassName ??
          (item.accent
            ? "text-[#dc2626]"
            : item.success
              ? "text-[#00B42A]"
              : "text-[#111827]");
        const inner = (
          <>
            <p className="text-[0.72rem] text-[#94a3b8]">{item.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${valueColor}`}>
              {item.value}
            </p>
            {item.href && (
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">点击查看明细 →</p>
            )}
          </>
        );
        const className = `rounded-[12px] border bg-white px-3 py-3 shadow-sm block text-left transition-colors ${
          item.success
            ? "border-[#bbf7d0]"
            : "border-[#eef2f7]"
        } ${
          item.href
            ? "hover:border-[#bfdbfe] hover:bg-[#f8fbff] cursor-pointer"
            : ""
        }`;
        return item.href ? (
          <Link key={item.label} href={item.href} className={className}>
            {inner}
          </Link>
        ) : (
          <div key={item.label} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function N7LeaderboardTable({
  rows,
  nameHeader,
  hrefForRow,
  hrefForMetric,
  emptyText,
}: {
  rows: N7BoardRow[];
  nameHeader: string;
  hrefForRow: (row: N7BoardRow) => string;
  /** 指标下钻：待跟进 / P0 / 未订阅 / 未打卡 */
  hrefForMetric?: (row: N7BoardRow, metric: N7BoardMetric) => string;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-[#eef2f7] bg-white p-8 text-center text-sm text-[#64748b]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
      <table className="min-w-[720px] w-full text-sm">
        <thead>
          <tr className="border-b border-[#eef2f7] text-left text-[0.72rem] uppercase tracking-wide text-[#94a3b8]">
            <th className="sticky left-0 z-10 bg-white px-3 sm:px-4 py-3 font-semibold">排名</th>
            <th className="sticky left-10 sm:left-12 z-10 bg-white px-3 sm:px-4 py-3 font-semibold shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]">
              {nameHeader}
            </th>
            <th className="px-3 sm:px-4 py-3 font-semibold text-right">拓展</th>
            <th className="px-3 sm:px-4 py-3 font-semibold text-right">达标</th>
            <th className="px-3 sm:px-4 py-3 font-semibold text-right">达标率</th>
            <th className="px-3 sm:px-4 py-3 font-semibold text-right">待跟进</th>
            <th className="px-3 sm:px-4 py-3 font-semibold text-right">剩余≤2天</th>
            <th className="px-3 sm:px-4 py-3 font-semibold text-right">未订阅</th>
            <th className="px-3 sm:px-4 py-3 font-semibold text-right">未打卡</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              data-list-anchor={row.key}
              className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc]"
            >
              <td className="sticky left-0 z-10 bg-white px-3 sm:px-4 py-3">
                <RankBadge rank={row.rank} />
              </td>
              <td className="sticky left-10 sm:left-12 z-10 bg-white px-3 sm:px-4 py-3 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]">
                <Link
                  href={hrefForRow(row)}
                  className="font-medium text-[#2563eb] hover:text-[#1d4ed8] whitespace-nowrap"
                >
                  {row.name}
                </Link>
              </td>
              <td className="px-3 sm:px-4 py-3 text-right tabular-nums">{row.expandCount}</td>
              <td className="px-3 sm:px-4 py-3 text-right tabular-nums">{row.qualifiedCount}</td>
              <td className="px-3 sm:px-4 py-3 text-right tabular-nums">
                {row.qualifyRate.toFixed(1)}%
              </td>
              <MetricCell
                value={row.followUpCount}
                href={hrefForMetric?.(row, "followUp")}
              />
              <MetricCell
                value={row.p0Count}
                href={hrefForMetric?.(row, "p0")}
                accent
              />
              <MetricCell
                value={row.notSubscribedCount}
                href={hrefForMetric?.(row, "notSubscribed")}
              />
              <MetricCell
                value={row.notCheckedInCount}
                href={hrefForMetric?.(row, "notCheckedIn")}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
