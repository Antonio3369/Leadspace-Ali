"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import {
  NotionAlert,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import { XlvQualificationBadge } from "@/components/xlv/XlvQualificationBadge";
import type {
  XlvStaffMonthlyDeviceRow,
  XlvStaffMonthlySummary,
} from "@/services/xlv/staff-monthly";

interface ApiResponse {
  dateFrom: string;
  dateTo: string;
  manager: { key: string; name: string };
  staff: { key: string; name: string };
  summary: XlvStaffMonthlySummary;
  expandDevices: XlvStaffMonthlyDeviceRow[];
  followUpDevices: XlvStaffMonthlyDeviceRow[];
}

export function XlvStaffMonthlyPerformanceView({
  managerKey,
  staffKey,
  backHref,
}: {
  managerKey: string;
  staffKey: string;
  backHref?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);
  const basePath = xlvPath(
    `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}/performance`
  );
  const devicesHref = xlvPath(
    `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}`
  );

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(
      `/api/xlv/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}/performance?${rangeQs}`
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managerKey, staffKey, rangeQs]);

  return (
    <PageShell>
      <PageHeader
        title={data?.staff.name ?? "队员绩效"}
        kicker={`微信小绿盒 · ${data?.manager.name ?? "—"}`}
        meta={
          <div className="space-y-1 text-sm text-[#64748b]">
            <p className="hidden sm:block">
              拓展/达标按<strong>首笔交易日期</strong>落在所选区间统计；回访按<strong>跟进日</strong>；唤醒由导入数据自动判定。
            </p>
            <p className="sm:hidden">
              拓展/达标看首笔交易月；回访看跟进日。
            </p>
            {backHref ? (
              <HistoryBackLink
                label="← 返回"
                fallbackHref={backHref}
                preferHistoryBack
                className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
              />
            ) : null}
          </div>
        }
        actions={
          <div className="hidden md:block">
            <N7DateRangePicker
              compact
              dateLabel="统计区间"
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(next) => {
                const params = new URLSearchParams(searchParams.toString());
                applyN7DateRangeToParams(params, next.dateFrom, next.dateTo);
                router.replace(`${basePath}?${params}`, { scroll: false });
              }}
            />
          </div>
        }
      />

      <div className="md:hidden sticky top-0 z-10 -mx-4 px-4 py-3 bg-[#f4f6f9]/95 backdrop-blur-sm border-b border-[#eef2f7]">
        <N7DateRangePicker
          compact
          dateLabel="统计区间"
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(next) => {
            const params = new URLSearchParams(searchParams.toString());
            applyN7DateRangeToParams(params, next.dateFrom, next.dateTo);
            router.replace(`${basePath}?${params}`, { scroll: false });
          }}
        />
      </div>

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {loading ? <p className="text-sm text-[#94a3b8]">加载中…</p> : null}

      {!loading && data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="拓展（首笔交易）"
              value={data.summary.expandCount}
              sub={`达标 ${data.summary.qualifiedCount}（${data.summary.qualifyRate}%）`}
              tone="blue"
            />
            <StatCard
              label="考核中"
              value={data.summary.inProgressCount}
              sub={`无效 ${data.summary.invalidCount}`}
            />
            <StatCard
              label="回访跟进"
              value={data.summary.followUpCount}
              sub="按跟进日"
              tone="blue"
            />
            <StatCard
              label="已唤醒"
              value={data.summary.wakeUpCount}
              sub={`唤醒率 ${data.summary.wakeUpRate}% · 仍沉睡 ${data.summary.stillDormantCount}`}
              tone="green"
            />
          </div>

          <p className="text-xs text-[#94a3b8]">
            {data.dateFrom} ~ {data.dateTo}
            <span className="mx-2">·</span>
            <Link href={devicesHref} className="text-[#2563eb] hover:underline">
              查看全部设备明细
            </Link>
          </p>

          <DeviceSection
            title="拓展设备"
            emptyText="所选区间内无首笔交易设备"
            devices={data.expandDevices}
            showQualification
          />

          <DeviceSection
            title="回访跟进"
            emptyText="所选区间内无回访跟进"
            devices={data.followUpDevices}
            showWakeUp
          />
        </div>
      ) : null}
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "default" | "blue" | "green";
}) {
  const valueClass =
    tone === "blue"
      ? "text-[#2563eb]"
      : tone === "green"
        ? "text-[#16a34a]"
        : "text-[#111827]";
  return (
    <div className="rounded-[12px] border border-[#eef2f7] bg-white px-3 py-3 sm:px-4 sm:py-3 shadow-sm">
      <p className="text-[0.72rem] text-[#94a3b8]">{label}</p>
      <p className={`mt-1 text-lg sm:text-xl font-semibold tabular-nums ${valueClass}`}>
        {value.toLocaleString()}
      </p>
      {sub ? <p className="mt-1 text-[0.68rem] leading-snug text-[#94a3b8]">{sub}</p> : null}
    </div>
  );
}

function DeviceSection({
  title,
  emptyText,
  devices,
  showQualification,
  showWakeUp,
}: {
  title: string;
  emptyText: string;
  devices: XlvStaffMonthlyDeviceRow[];
  showQualification?: boolean;
  showWakeUp?: boolean;
}) {
  if (devices.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[#111827]">{title}</h2>
        <p className="text-sm text-[#94a3b8] rounded-[14px] border border-[#eef2f7] bg-white px-4 py-8 text-center">
          {emptyText}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-[#111827]">
        {title}
        <span className="ml-2 text-xs font-normal text-[#94a3b8]">{devices.length} 台</span>
      </h2>

      <div className="sm:hidden space-y-2">
        {devices.map((d) => (
          <Link
            key={d.deviceSn}
            href={xlvPath(`/devices/${encodeURIComponent(d.deviceSn)}`)}
            className="block rounded-[12px] border border-[#eef2f7] bg-white px-3.5 py-3 shadow-sm active:bg-[#f8fafc]"
          >
            <p className="font-mono text-xs text-[#2563eb]">{d.deviceSn}</p>
            <p className="mt-1 text-sm font-medium text-[#111827] truncate">
              {d.merchantName || "—"}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#64748b]">
              <span>首笔 {d.firstTxnDate ?? "—"}</span>
              {showQualification ? (
                <XlvQualificationBadge status={d.qualificationStatus} compact />
              ) : null}
              {showWakeUp ? (
                <>
                  <span>跟进 {d.followUpAt ?? "—"}</span>
                  <span className={d.woken ? "text-[#16a34a] font-medium" : "text-amber-800"}>
                    {d.woken ? "已唤醒" : "仍沉睡"}
                  </span>
                </>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden sm:block rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#f1f5f9] text-left text-xs text-[#94a3b8]">
              <th className="px-4 py-2.5 font-medium">设备 / 商户</th>
              <th className="px-4 py-2.5 font-medium">首笔交易</th>
              {showQualification ? (
                <th className="px-4 py-2.5 font-medium">考核</th>
              ) : null}
              {showWakeUp ? (
                <>
                  <th className="px-4 py-2.5 font-medium">跟进日</th>
                  <th className="px-4 py-2.5 font-medium">唤醒</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.deviceSn} className="border-t border-[#f8fafc] hover:bg-[#f8fafc]/60">
                <td className="px-4 py-3">
                  <Link
                    href={xlvPath(`/devices/${encodeURIComponent(d.deviceSn)}`)}
                    className="font-mono text-xs text-[#2563eb] hover:underline"
                  >
                    {d.deviceSn}
                  </Link>
                  <p className="text-xs text-[#64748b] truncate max-w-[220px]">
                    {d.merchantName || "—"}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs text-[#64748b] tabular-nums">
                  {d.firstTxnDate ?? "—"}
                </td>
                {showQualification ? (
                  <td className="px-4 py-3">
                    <XlvQualificationBadge status={d.qualificationStatus} />
                  </td>
                ) : null}
                {showWakeUp ? (
                  <>
                    <td className="px-4 py-3 text-xs text-[#64748b] tabular-nums">
                      {d.followUpAt ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {d.woken ? (
                        <span className="text-[#16a34a] font-medium">已唤醒</span>
                      ) : (
                        <span className="text-amber-800">仍沉睡</span>
                      )}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}