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
  expiredUnqualifiedCount?: number;
  notSubscribedCount: number;
  notCheckedInCount: number;
  notLitCount: number;
}

export type N7BoardMetric = "followUp" | "p0" | "expired";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-bold text-amber-500">🥇 {rank}</span>;
  if (rank === 2) return <span className="font-bold text-gray-400">🥈 {rank}</span>;
  if (rank === 3) return <span className="font-bold text-orange-400">🥉 {rank}</span>;
  return <span className="text-[#94a3b8]">{rank}</span>;
}

function MetricLink({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "default" | "accent" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[#c41e3a]"
      : tone === "accent"
        ? "text-[#dc2626]"
        : "text-[#111827]";
  const inner = (
    <>
      <span className="text-[#94a3b8]">{label}</span>
      <span className={`font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </>
  );
  if (href && value > 0) {
    return (
      <Link
        href={href}
        className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 hover:bg-[#f1f5f9]"
        title={`查看「${label}」明细`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1 px-1.5 py-0.5">{inner}</span>
  );
}

export function N7SummaryStrip({
  totals,
  followUpHref,
  p0Href,
  expiredHref,
}: {
  totals: {
    expandCount: number;
    qualifiedCount: number;
    qualifyRate: number;
    followUpCount: number;
    p0Count: number;
    expiredUnqualifiedCount?: number;
  };
  /** 待跟进卡片下钻链接 */
  followUpHref?: string;
  /** P0 卡片下钻链接 */
  p0Href?: string;
  /** 过期未达标下钻 */
  expiredHref?: string;
}) {
  const expiredCount = totals.expiredUnqualifiedCount ?? 0;
  const items: Array<{
    label: string;
    value: string | number;
    href?: string;
    accent?: boolean;
    danger?: boolean;
    success?: boolean;
    valueClassName?: string;
    hint?: string;
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
    {
      label: "过期未达标",
      value: expiredCount,
      href: expiredHref,
      danger: true,
      hint: "考核结束仍未达标",
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((item) => {
        const valueColor =
          item.valueClassName ??
          (item.danger
            ? "text-[#c41e3a]"
            : item.accent
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
            {item.hint ? (
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">{item.hint}</p>
            ) : null}
            {item.href && (
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">点击查看明细 →</p>
            )}
          </>
        );
        const className = `rounded-[12px] border bg-white px-3 py-3 shadow-sm block text-left transition-colors ${
          item.success
            ? "border-[#bbf7d0]"
            : item.danger
              ? "border-[#fecaca]"
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

/** 手机友好的队员/经理排行列表（非宽表） */
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
  /** 指标下钻：待跟进 / P0 / 过期未达标 */
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
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
      <ul className="divide-y divide-[#f1f5f9]" aria-label={`${nameHeader}排行`}>
        {rows.map((row) => {
          const rateColor =
            row.qualifyRate >= 75
              ? "text-[#00B42A]"
              : row.qualifyRate >= 60
                ? "text-[#FF7D00]"
                : "text-[#F53F3F]";
          return (
            <li
              key={row.key}
              data-list-anchor={row.key}
              className="px-4 py-3.5 hover:bg-[#f8fafc]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 shrink-0 pt-0.5 text-base tabular-nums">
                  <RankBadge rank={row.rank} />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Link
                    href={hrefForRow(row)}
                    className="block truncate text-base font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
                  >
                    {row.name}
                  </Link>
                  <p className="text-sm tabular-nums text-[#64748b]">
                    拓展 {row.expandCount}
                    <span className="mx-1.5 text-[#cbd5e1]">·</span>
                    达标 {row.qualifiedCount}
                    <span className="mx-1.5 text-[#cbd5e1]">·</span>
                    <span className={`font-semibold ${rateColor}`}>
                      {row.qualifyRate.toFixed(1)}%
                    </span>
                  </p>
                  <div className="-mx-1.5 flex flex-wrap gap-x-1 gap-y-1 text-sm">
                    <MetricLink
                      label="待跟进"
                      value={row.followUpCount}
                      href={hrefForMetric?.(row, "followUp")}
                    />
                    <MetricLink
                      label="≤2天"
                      value={row.p0Count}
                      href={hrefForMetric?.(row, "p0")}
                      tone="accent"
                    />
                    <MetricLink
                      label="过期"
                      value={row.expiredUnqualifiedCount ?? 0}
                      href={hrefForMetric?.(row, "expired")}
                      tone="danger"
                    />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
