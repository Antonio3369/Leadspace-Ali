"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { readResponseJson } from "@/lib/fetch-json";
import { xlvPath } from "@/lib/business-lines";
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { NotionAlert, PageHeader, PageShell } from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import type { XlvDailyAudience, XlvDailyRow } from "@/services/xlv/daily";

interface Point {
  date: string;
  followUpCount: number;
  wakeUpCount: number;
}

interface ApiResponse {
  dateFrom: string;
  dateTo: string;
  audience: XlvDailyAudience;
  summary: {
    followUpCount: number;
    wakeUpCount: number;
    stillDormantCount: number;
    wakeUpRate: number;
  };
  points: Point[];
  rows: XlvDailyRow[];
}

const COLOR_FOLLOW = "#2563eb";
const COLOR_WAKE = "#16a34a";

const AUDIENCE_LABEL: Record<XlvDailyAudience, string> = {
  managers: "经理排行",
  staff: "队员排行",
  self: "我的回访",
};

export function XlvDailyView({
  role,
  managerKey,
}: {
  role: string;
  managerKey?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/xlv/daily?${rangeQs}`)
      .then(async (res) => {
        const json = await readResponseJson<ApiResponse & { error?: string }>(
          res,
          "加载日报"
        );
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) {
          setData(json);
          setSelected(null);
        }
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
  }, [rangeQs]);

  const selectedPoint = data?.points.find((p) => p.date === selected) ?? null;
  const spanMonths = dateFrom.slice(0, 7) !== dateTo.slice(0, 7);
  const chartData =
    data?.points.map((p) => ({
      ...p,
      label: spanMonths ? p.date.slice(5) : p.date.slice(8),
    })) ?? [];

  const kicker =
    role === "SALES"
      ? "本人"
      : role === "MANAGER"
        ? "本团队"
        : "微信小绿盒";

  return (
    <PageShell>
      <PageHeader
        title="回访情况"
        kicker={kicker}
        meta={
          <p className="text-sm text-[#64748b]">
            <span className="sm:hidden">蓝柱=回访跟进，绿柱=已唤醒。</span>
            <span className="hidden sm:inline">
              回访跟进按跟进日统计；唤醒按导入数据自动判定（不再沉睡或末笔晚于跟进）。
            </span>
          </p>
        }
        actions={
          <div className="hidden md:block">
            <N7DateRangePicker
              compact
              dateFrom={dateFrom}
              dateTo={dateTo}
              dateLabel="跟进日"
              onChange={(next) => {
                const params = new URLSearchParams(searchParams.toString());
                applyN7DateRangeToParams(params, next.dateFrom, next.dateTo);
                router.replace(`${xlvPath("/daily")}?${params}`, { scroll: false });
              }}
            />
          </div>
        }
      />

      <div className="md:hidden sticky top-0 z-10 -mx-4 px-4 py-3 bg-[#f4f6f9]/95 backdrop-blur-sm border-b border-[#eef2f7]">
        <N7DateRangePicker
          compact
          dateFrom={dateFrom}
          dateTo={dateTo}
          dateLabel="跟进日"
          onChange={(next) => {
            const params = new URLSearchParams(searchParams.toString());
            applyN7DateRangeToParams(params, next.dateFrom, next.dateTo);
            router.replace(`${xlvPath("/daily")}?${params}`, { scroll: false });
          }}
        />
      </div>

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && <p className="text-sm text-[#94a3b8]">加载中…</p>}

      {!loading && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-[12px] border border-[#eef2f7] bg-white px-4 py-3 shadow-sm">
              <p className="text-[0.72rem] text-[#94a3b8]">回访跟进</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#2563eb]">
                {data.summary.followUpCount.toLocaleString()}
              </p>
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">
                {dateFrom} ~ {dateTo}
              </p>
            </div>
            <div className="rounded-[12px] border border-[#bbf7d0] bg-white px-4 py-3 shadow-sm">
              <p className="text-[0.72rem] text-[#94a3b8]">已唤醒</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#16a34a]">
                {data.summary.wakeUpCount.toLocaleString()}
              </p>
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">
                唤醒率 {data.summary.wakeUpRate.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-[12px] border border-amber-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-[0.72rem] text-[#94a3b8]">仍沉睡</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-amber-800">
                {data.summary.stillDormantCount.toLocaleString()}
              </p>
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">已回访未恢复收款</p>
            </div>
            <div className="rounded-[12px] border border-[#eef2f7] bg-white px-4 py-3 shadow-sm col-span-2 sm:col-span-1">
              <p className="text-[0.72rem] text-[#94a3b8]">统计对象</p>
              <p className="mt-1 text-sm font-semibold text-[#111827]">
                {AUDIENCE_LABEL[data.audience]}
              </p>
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">
                {data.rows.length} 人
              </p>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-3 sm:p-4 shadow-sm h-[220px] sm:h-[300px] md:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
                onClick={(state) => {
                  const label = (
                    state as { activePayload?: { payload?: Point }[] }
                  )?.activePayload?.[0]?.payload?.date;
                  if (label) setSelected(label);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickMargin={8}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  width={24}
                />
                <Tooltip
                  cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #eef2f7",
                    fontSize: 12,
                  }}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.date ?? ""
                  }
                  formatter={(value, name) => [
                    value,
                    name === "followUpCount" ? "回访跟进" : "已唤醒",
                  ]}
                />
                <Legend
                  formatter={(value) =>
                    value === "followUpCount" ? "回访跟进" : "已唤醒"
                  }
                />
                <Bar
                  dataKey="followUpCount"
                  name="followUpCount"
                  fill={COLOR_FOLLOW}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
                <Bar
                  dataKey="wakeUpCount"
                  name="wakeUpCount"
                  fill={COLOR_WAKE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {selectedPoint ? (
            <div className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm text-sm">
              <p className="font-medium text-[#111827]">{selectedPoint.date}</p>
              <p className="mt-2 text-[#64748b]">
                回访跟进 {selectedPoint.followUpCount} · 已唤醒{" "}
                {selectedPoint.wakeUpCount}
              </p>
            </div>
          ) : null}

          {data.rows.length > 0 ? (
            <>
              <div className="sm:hidden space-y-2">
                {data.rows.map((row) => {
                  const performanceHref =
                    data.audience === "staff" && managerKey
                      ? xlvPath(
                          `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(row.key)}/performance?${rangeQs}`
                        )
                      : null;
                  const inner = (
                    <>
                      <p className="font-medium text-[#111827]">{row.name}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[#94a3b8]">回访跟进</p>
                          <p className="tabular-nums font-semibold text-[#2563eb]">
                            {row.followUpCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#94a3b8]">已唤醒</p>
                          <p className="tabular-nums font-semibold text-[#16a34a]">
                            {row.wakeUpCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#94a3b8]">仍沉睡</p>
                          <p className="tabular-nums font-semibold text-amber-800">
                            {row.stillDormantCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#94a3b8]">唤醒率</p>
                          <p className="tabular-nums font-semibold text-[#64748b]">
                            {row.wakeUpRate.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </>
                  );
                  return performanceHref ? (
                    <Link
                      key={row.key}
                      href={performanceHref}
                      className="block rounded-[12px] border border-[#eef2f7] bg-white px-3.5 py-3 shadow-sm active:bg-[#f8fafc]"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={row.key}
                      className="rounded-[12px] border border-[#eef2f7] bg-white px-3.5 py-3 shadow-sm"
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>

              <div className="hidden sm:block rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f1f5f9] text-left text-[#94a3b8]">
                    <th className="px-4 py-3 font-medium">
                      {data.audience === "managers"
                        ? "经理"
                        : data.audience === "staff"
                          ? "队员"
                          : "姓名"}
                    </th>
                    <th className="px-4 py-3 font-medium text-right">回访跟进</th>
                    <th className="px-4 py-3 font-medium text-right">已唤醒</th>
                    <th className="px-4 py-3 font-medium text-right">仍沉睡</th>
                    <th className="px-4 py-3 font-medium text-right">唤醒率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const performanceHref =
                      data.audience === "staff" && managerKey
                        ? xlvPath(
                            `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(row.key)}/performance?${rangeQs}`
                          )
                        : data.audience === "self" && managerKey
                          ? xlvPath(
                              `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(row.key)}/performance?${rangeQs}`
                            )
                          : null;
                    return (
                    <tr
                      key={row.key}
                      className="border-t border-[#f8fafc] hover:bg-[#f8fafc]/60"
                    >
                      <td className="px-4 py-3 font-medium text-[#111827]">
                        {performanceHref ? (
                          <Link
                            href={performanceHref}
                            className="text-[#2563eb] hover:text-[#1d4ed8] hover:underline"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          row.name
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#2563eb]">
                        {row.followUpCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#16a34a]">
                        {row.wakeUpCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-800">
                        {row.stillDormantCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                        {row.wakeUpRate.toFixed(1)}%
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <p className="text-sm text-[#94a3b8] text-center py-6">
              所选日期内暂无回访跟进记录
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
