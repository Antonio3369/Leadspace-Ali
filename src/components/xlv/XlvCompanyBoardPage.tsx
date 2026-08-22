"use client";

import { useEffect, useState } from "react";
import { fetchXlvJson } from "@/lib/xlv-fetch";
import {
  NotionAlert,
  NotionCallout,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { XLV_COMPLIANCE_TARGET_RATE } from "@/lib/xlv-rules";
import type {
  XlvCompanyBoardResult,
  XlvCompanyBoardRow,
} from "@/lib/xlv-company-board";
import { isXlvCompanyBoardTailRow } from "@/lib/xlv-company-board";
import {
  xlvBoardMetricBaseClass,
  xlvBoardMetricNeutralClass,
} from "@/components/xlv/xlv-filter-styles";

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

function complianceGap(deployed: number, compliant: number) {
  const required = Math.ceil(deployed * (XLV_COMPLIANCE_TARGET_RATE / 100));
  return Math.max(0, required - compliant);
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-bold text-amber-500">🥇 {rank}</span>;
  if (rank === 2) return <span className="font-bold text-gray-400">🥈 {rank}</span>;
  if (rank === 3) return <span className="font-bold text-orange-400">🥉 {rank}</span>;
  return <span className="text-[#94a3b8]">{rank}</span>;
}

function SummaryTile({
  label,
  value,
  sub,
  valueClass = "text-[#111827]",
}: {
  label: string;
  value: string | number;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[12px] border border-[#eef2f7] bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[11px] font-medium text-[#94a3b8]">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums leading-tight ${valueClass}`}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] text-[#64748b]">{sub}</p> : null}
    </div>
  );
}

function CompanySummaryPanel({
  summary,
}: {
  summary: XlvCompanyBoardResult["summary"];
}) {
  const gap = complianceGap(summary.deployedCount, summary.compliantCount);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
        <span className="rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 font-medium">
          名册 {summary.companyCount} 家
        </span>
        {summary.dataDate ? (
          <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 font-medium text-[#2563eb]">
            数据日期 {summary.dataDate}
          </span>
        ) : null}
        <span className="rounded-full border border-[#fce7f3] bg-[#fff1f2] px-2.5 py-1 font-medium text-[#be123c]">
          按沉睡从多到少
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label="已铺设" value={summary.deployedCount} />
        <SummaryTile
          label="本月拓展"
          value={summary.monthExpandCount}
          valueClass="text-[#2563eb]"
        />
        <SummaryTile label="考核中" value={summary.inProgressCount} />
        <SummaryTile
          label="沉睡"
          value={summary.dormantCount}
          valueClass="text-rose-600"
        />
      </div>

      <div className="rounded-[14px] border border-[#eef2f7] bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-[#94a3b8]">全平台合规率（{XLV_COMPLIANCE_TARGET_RATE}% 线）</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                summary.complianceRate >= XLV_COMPLIANCE_TARGET_RATE
                  ? "text-emerald-700"
                  : "text-[#b91c1c]"
              }`}
            >
              {pct(summary.complianceRate)}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-[#64748b]">
              合规 {summary.compliantCount}/{summary.deployedCount}
              {gap > 0 ? ` · 还差 ${gap} 台` : " · 已达标"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#94a3b8]">本月唤醒率</p>
            <p className="text-lg font-bold tabular-nums text-[#111827]">
              {pct(summary.monthWakeUpRate)}
            </p>
            <p className="text-[10px] text-[#94a3b8]">单笔沉默 {summary.singleSilenceCount}</p>
          </div>
        </div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-[#f1f5f9]">
          <div
            className={`h-full rounded-full transition-all ${
              summary.complianceRate >= XLV_COMPLIANCE_TARGET_RATE
                ? "bg-emerald-500"
                : "bg-[#f87171]"
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, summary.complianceRate))}%`,
            }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#64748b]/40"
            style={{ left: `${XLV_COMPLIANCE_TARGET_RATE}%` }}
            title={`${XLV_COMPLIANCE_TARGET_RATE}% 合规线`}
          />
        </div>
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  className = xlvBoardMetricNeutralClass(),
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <span className={`${xlvBoardMetricBaseClass()} ${className}`}>
      <span>{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}

function CompanyRankCard({
  row,
  rank,
}: {
  row: XlvCompanyBoardRow;
  rank: number | null;
}) {
  const isTail = isXlvCompanyBoardTailRow(row);
  const gap = complianceGap(row.deployedCount, row.compliantCount);
  const onTarget = gap === 0 && row.deployedCount > 0;

  return (
    <li
      className={`px-4 py-3.5 ${
        isTail ? "bg-amber-50/70" : "hover:bg-[#f8fafc]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 shrink-0 pt-0.5 text-base tabular-nums">
          {rank != null ? <RankBadge rank={rank} /> : <span className="text-[#94a3b8]">—</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-base font-semibold text-[#111827] leading-snug">{row.name}</p>

          <div
            className={`rounded-[10px] border px-3 py-2.5 ${
              onTarget
                ? "border-emerald-100 bg-emerald-50/60"
                : row.deployedCount === 0
                  ? "border-[#eef2f7] bg-[#f8fafc]"
                  : "border-red-100 bg-red-50/70"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p
                className={`text-sm font-semibold ${
                  onTarget ? "text-emerald-800" : row.deployedCount === 0 ? "text-[#64748b]" : "text-[#b91c1c]"
                }`}
              >
                合规率{" "}
                <span className="text-base tabular-nums">{pct(row.complianceRate)}</span>
              </p>
              <span
                className={`shrink-0 text-xs font-semibold ${
                  onTarget ? "text-emerald-700" : row.deployedCount === 0 ? "text-[#94a3b8]" : "text-[#b91c1c]"
                }`}
              >
                {row.deployedCount === 0
                  ? "暂无设备"
                  : onTarget
                    ? "✓ 合规"
                    : `差 ${gap} 台`}
              </span>
            </div>
            {row.deployedCount > 0 ? (
              <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                <div
                  className={`h-full rounded-full ${onTarget ? "bg-emerald-500" : "bg-[#f87171]"}`}
                  style={{ width: `${Math.min(100, row.complianceRate)}%` }}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            <MetricChip label="已铺设" value={row.deployedCount} />
            <MetricChip
              label="本月拓展"
              value={row.monthExpandCount}
              className="border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]"
            />
            <MetricChip label="考核中" value={row.inProgressCount} />
            <MetricChip
              label="单笔沉默"
              value={row.singleSilenceCount}
              className="border-amber-100 bg-amber-50/80 text-amber-800"
            />
            <MetricChip
              label="沉睡"
              value={row.dormantCount}
              className="border-rose-100 bg-rose-50/80 text-rose-700"
            />
            <MetricChip label="唤醒率" value={pct(row.monthWakeUpRate)} />
          </div>
        </div>
      </div>
    </li>
  );
}

export function XlvCompanyBoardPage() {
  const [data, setData] = useState<XlvCompanyBoardResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const json = await fetchXlvJson<XlvCompanyBoardResult>(
          "/api/xlv/admin/companies"
        );
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = data?.summary;
  const rankedRows =
    data?.rows.filter((r) => !isXlvCompanyBoardTailRow(r)) ?? [];
  const tailRows = data?.rows.filter((r) => isXlvCompanyBoardTailRow(r)) ?? [];

  return (
    <PageShell>
      <PageHeader
        title="分公司排名"
        kicker="微信小绿盒 · 管理员"
        meta={
          <p className="text-sm text-[#64748b]">
            按组织名册汇总各分公司考核与风险指标。
          </p>
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 rounded-[12px] bg-[#eef2f7]" />
            ))}
          </div>
          <div className="h-24 rounded-[14px] bg-[#eef2f7]" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-[14px] bg-[#eef2f7]" />
          ))}
        </div>
      ) : data && summary ? (
        <div className="space-y-4">
          <CompanySummaryPanel summary={summary} />

          {(summary.unassignedDeployedCount ?? 0) > 0 ? (
            <NotionCallout tone="warning">
              有 {summary.unassignedDeployedCount}{" "}
              台已铺设设备尚未确认分公司（含运营表「待定」、名册未覆盖等），见列表末尾「未归属 /
              待定」。
            </NotionCallout>
          ) : null}

          <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[#f1f5f9] bg-[#f8fafc] px-4 py-2.5">
              <p className="text-sm font-semibold text-[#111827]">分公司排行</p>
              <p className="text-xs text-[#94a3b8]">沉睡商户越多排名越靠前</p>
            </div>
            <ul className="divide-y divide-[#f1f5f9]" aria-label="分公司排行">
              {rankedRows.map((row, idx) => (
                <CompanyRankCard key={row.key} row={row} rank={idx + 1} />
              ))}
              {tailRows.map((row) => (
                <CompanyRankCard key={row.key} row={row} rank={null} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
