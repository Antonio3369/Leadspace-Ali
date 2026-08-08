"use client";

import Link from "next/link";
import type { XlvBoardRow } from "@/services/xlv/board";
import { xlvPath } from "@/lib/business-lines";
import { getCurrentMonthRange } from "@/lib/ledger-date";
import { n7DateRangeQuery } from "@/lib/n7-date";
import {
  isXlvInventoryManagerKey,
  XLV_INVENTORY_MANAGER_LABEL,
  type XlvQualificationStatus,
} from "@/lib/xlv-rules";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-bold text-amber-500">🥇 {rank}</span>;
  if (rank === 2) return <span className="font-bold text-gray-400">🥈 {rank}</span>;
  if (rank === 3) return <span className="font-bold text-orange-400">🥉 {rank}</span>;
  return <span className="text-[#94a3b8]">{rank}</span>;
}

function MetricCell({
  label,
  value,
  href,
  tone = "default",
  active = false,
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "default" | "danger" | "amber" | "success" | "sky" | "muted";
  active?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "text-[#c41e3a]"
      : tone === "amber"
        ? "text-amber-800"
        : tone === "success"
          ? "text-emerald-700"
          : tone === "sky"
            ? "text-sky-700"
            : tone === "muted"
              ? "text-slate-500"
              : "text-[#111827]";
  const inner = (
    <>
      <span className="text-[#94a3b8]">{label}</span>
      <span className={`font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </>
  );
  const activeClass = active ? "ring-2 ring-[#2563eb]/30 bg-[#eff6ff]" : "";
  if (href && value > 0) {
    return (
      <Link
        href={href}
        className={`inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 hover:bg-[#f1f5f9] ${activeClass}`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span
      className={`inline-flex items-baseline gap-1 px-1.5 py-0.5 ${activeClass}`}
    >
      {inner}
    </span>
  );
}

export function XlvSummaryStrip({
  summary,
}: {
  summary: {
    managerCount?: number;
    staffCount?: number;
    deviceCount: number;
    deployedCount: number;
    inventoryCount?: number;
    qualifiedCount: number;
    inProgressCount?: number;
    invalidCount?: number;
    qualifyRate?: number;
  };
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-[14px] border border-[#eef2f7] bg-white px-3 py-3 text-xs">
      {summary.managerCount != null ? (
        <div>
          <p className="text-[#94a3b8]">经理数</p>
          <p className="text-lg font-bold tabular-nums text-[#111827]">
            {summary.managerCount}
          </p>
        </div>
      ) : null}
      {summary.staffCount != null ? (
        <div>
          <p className="text-[#94a3b8]">队员数</p>
          <p className="text-lg font-bold tabular-nums text-[#111827]">
            {summary.staffCount}
          </p>
        </div>
      ) : null}
      <div>
        <p className="text-[#94a3b8]">已铺设</p>
        <p className="text-lg font-bold tabular-nums text-[#111827]">
          {summary.deployedCount}
        </p>
      </div>
      {(summary.inventoryCount ?? 0) > 0 ? (
        <div>
          <p className="text-[#94a3b8]">剩余库存</p>
          <p className="text-lg font-bold tabular-nums text-[#64748b]">
            <Link
              href={xlvPath(
                `/?manager=${encodeURIComponent(XLV_INVENTORY_MANAGER_LABEL)}`
              )}
              className="hover:text-[#475569]"
              title="查看未挂经理的库存设备"
            >
              {summary.deviceCount}/{summary.inventoryCount}
            </Link>
          </p>
        </div>
      ) : null}
      <div>
        <p className="text-[#94a3b8]">已达标</p>
        <p className="text-lg font-bold tabular-nums text-emerald-700">
          {summary.qualifiedCount}
          {summary.qualifyRate != null ? (
            <span className="ml-1 text-xs font-medium text-[#64748b]">
              ({summary.qualifyRate}%)
            </span>
          ) : null}
        </p>
        {summary.deployedCount > 0 ? (
          <p className="text-[10px] text-[#94a3b8] mt-0.5">占已铺设设备</p>
        ) : null}
        {(summary.inProgressCount ?? 0) > 0 || (summary.invalidCount ?? 0) > 0 ? (
          <p className="text-[10px] text-[#64748b] mt-1 tabular-nums">
            考核中 {summary.inProgressCount ?? 0} · 无效 {summary.invalidCount ?? 0}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function statusHref(base: string, status: XlvQualificationStatus) {
  return `${base}?status=${status}`;
}

function alertHref(base: string, alert: string) {
  return `${base}?alert=${alert}`;
}

export function XlvLeaderboardTable({
  rows,
  mode,
  managerKey,
  statusFilter,
}: {
  rows: XlvBoardRow[];
  mode: "managers" | "staff";
  managerKey?: string;
  statusFilter?: XlvQualificationStatus | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[14px] border border-[#eef2f7] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
        暂无数据
      </p>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[#f1f5f9] text-left text-xs text-[#94a3b8]">
              <th className="px-3 py-2.5 w-12">#</th>
              <th className="px-3 py-2.5">
                {mode === "managers" ? "经理" : "队员"}
              </th>
              <th className="px-3 py-2.5">设备</th>
              <th className="px-3 py-2.5">已达标</th>
              <th className="px-3 py-2.5">考核中</th>
              <th className="px-3 py-2.5">无效</th>
              <th className="px-3 py-2.5">单笔沉默</th>
              <th className="px-3 py-2.5">沉睡</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {rows.map((row, idx) => {
              const rank = idx + 1;
              const isInventory =
                mode === "managers" && isXlvInventoryManagerKey(row.key);
              const devicesHref =
                mode === "staff" && managerKey
                  ? xlvPath(
                      `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(row.key)}`
                    )
                  : mode === "managers"
                    ? xlvPath(`/managers/${encodeURIComponent(row.key)}`)
                    : null;
              const { dateFrom, dateTo } = getCurrentMonthRange();
              const monthQs = n7DateRangeQuery(dateFrom, dateTo);
              const nameHref =
                mode === "staff" && managerKey
                  ? xlvPath(
                      `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(row.key)}/performance?${monthQs}`
                    )
                  : devicesHref;
              return (
                <tr
                  key={row.key}
                  className={isInventory ? "bg-[#fafbfc]" : "hover:bg-[#f8fafc]"}
                >
                  <td className="px-3 py-3">
                    {isInventory ? (
                      <span className="text-[#94a3b8]">—</span>
                    ) : (
                      <RankBadge rank={rank} />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={
                        statusFilter && mode === "managers" && devicesHref
                          ? `${devicesHref}?status=${statusFilter}`
                          : (nameHref ?? "#")
                      }
                      className={
                        isInventory
                          ? "font-medium text-[#64748b] hover:text-[#475569]"
                          : "font-medium text-[#2563eb] hover:text-[#1d4ed8]"
                      }
                      title={isInventory ? "未挂经理的库存设备" : undefined}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{row.deviceCount}</td>
                  <td className="px-3 py-3">
                    <MetricCell
                      label=""
                      value={row.qualifiedCount}
                      href={
                        devicesHref
                          ? statusHref(devicesHref, "qualified")
                          : statusHref(devicesHref ?? "", "qualified")
                      }
                      tone="success"
                      active={statusFilter === "qualified"}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <MetricCell
                      label=""
                      value={row.inProgressCount}
                      href={
                        devicesHref
                          ? statusHref(devicesHref, "in_progress")
                          : statusHref(devicesHref ?? "", "in_progress")
                      }
                      tone="sky"
                      active={statusFilter === "in_progress"}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <MetricCell
                      label=""
                      value={row.invalidCount}
                      href={
                        devicesHref
                          ? statusHref(devicesHref, "invalid")
                          : statusHref(devicesHref ?? "", "invalid")
                      }
                      tone="muted"
                      active={statusFilter === "invalid"}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <MetricCell
                      label=""
                      value={row.singleSilenceCount}
                      href={
                        devicesHref
                          ? alertHref(devicesHref, "single_silence")
                          : alertHref(devicesHref ?? "", "single_silence")
                      }
                      tone="danger"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <MetricCell
                      label=""
                      value={row.dormantCount}
                      href={
                        devicesHref
                          ? alertHref(devicesHref, "dormant")
                          : alertHref(devicesHref ?? "", "dormant")
                      }
                      tone="amber"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
