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
import {
  xlvAlertTextClass,
  xlvBoardMetricBaseClass,
  xlvBoardMetricNeutralClass,
  xlvQualStatusTextClass,
} from "@/components/xlv/xlv-filter-styles";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-bold text-amber-500">🥇 {rank}</span>;
  if (rank === 2) return <span className="font-bold text-gray-400">🥈 {rank}</span>;
  if (rank === 3) return <span className="font-bold text-orange-400">🥉 {rank}</span>;
  return <span className="text-[#94a3b8]">{rank}</span>;
}

function BoardMetricChip({
  label,
  count,
  href,
  className,
}: {
  label: string;
  count: number;
  href?: string;
  className: string;
}) {
  const chipClass = `${xlvBoardMetricBaseClass()} ${className}`;
  const body = (
    <>
      <span>{label}</span>
      <span className="tabular-nums font-semibold">{count}</span>
    </>
  );
  if (href && count > 0) {
    return (
      <Link
        href={href}
        className={`${chipClass} hover:underline underline-offset-2`}
        title={`查看「${label}」明细`}
      >
        {body}
      </Link>
    );
  }
  return <span className={chipClass}>{body}</span>;
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

  const nameHeader = mode === "managers" ? "经理" : "队员";

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
      <ul className="divide-y divide-[#f1f5f9]" aria-label={`${nameHeader}排行`}>
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
          const rowNameHref =
            statusFilter && mode === "managers" && devicesHref
              ? `${devicesHref}?status=${statusFilter}`
              : (nameHref ?? "#");

          return (
            <li
              key={row.key}
              data-list-anchor={row.key}
              className={`px-4 py-3.5 ${isInventory ? "bg-[#fafbfc]" : "hover:bg-[#f8fafc]"}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 shrink-0 pt-0.5 text-base tabular-nums">
                  {isInventory ? (
                    <span className="text-[#94a3b8]">—</span>
                  ) : (
                    <RankBadge rank={rank} />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Link
                    href={rowNameHref}
                    className={`block truncate text-base font-semibold ${
                      isInventory
                        ? "text-[#64748b] hover:text-[#475569]"
                        : "text-[#2563eb] hover:text-[#1d4ed8]"
                    }`}
                    title={isInventory ? "未挂经理的库存设备" : undefined}
                  >
                    {row.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <BoardMetricChip
                      label="设备"
                      count={row.deviceCount}
                      href={devicesHref ?? undefined}
                      className={xlvBoardMetricNeutralClass()}
                    />
                    <BoardMetricChip
                      label="已达标"
                      count={row.qualifiedCount}
                      href={
                        devicesHref
                          ? statusHref(devicesHref, "qualified")
                          : undefined
                      }
                      className={xlvQualStatusTextClass(
                        "qualified",
                        statusFilter === "qualified"
                      )}
                    />
                    <BoardMetricChip
                      label="考核中"
                      count={row.inProgressCount}
                      href={
                        devicesHref
                          ? statusHref(devicesHref, "in_progress")
                          : undefined
                      }
                      className={xlvQualStatusTextClass(
                        "in_progress",
                        statusFilter === "in_progress"
                      )}
                    />
                    <BoardMetricChip
                      label="无效"
                      count={row.invalidCount}
                      href={
                        devicesHref
                          ? statusHref(devicesHref, "invalid")
                          : undefined
                      }
                      className={xlvQualStatusTextClass(
                        "invalid",
                        statusFilter === "invalid"
                      )}
                    />
                    <BoardMetricChip
                      label="单笔沉默"
                      count={row.singleSilenceCount}
                      href={
                        devicesHref
                          ? alertHref(devicesHref, "single_silence")
                          : undefined
                      }
                      className={xlvAlertTextClass("single_silence", false)}
                    />
                    <BoardMetricChip
                      label="沉睡"
                      count={row.dormantCount}
                      href={
                        devicesHref ? alertHref(devicesHref, "dormant") : undefined
                      }
                      className={xlvAlertTextClass("dormant", false)}
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
