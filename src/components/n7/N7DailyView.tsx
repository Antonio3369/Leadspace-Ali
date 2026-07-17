"use client";

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
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { n7Path } from "@/lib/business-lines";
import { NotionAlert, PageHeader, PageShell } from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";

interface Point {
  date: string;
  expandCount: number;
  qualifiedCount: number;
}

const COLOR_QUALIFIED = "#ea580c";
const COLOR_PENDING = "#2563eb";

export function N7DailyView({
  managerKey = null,
  viewerRole = "DIRECTOR",
}: {
  managerKey?: string | null;
  viewerRole?: "DIRECTOR" | "MANAGER";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);

  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams(rangeQs);
    if (managerKey) params.set("managerKey", managerKey);
    fetch(`/api/n7/daily?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) {
          setPoints(json.points ?? []);
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
  }, [rangeQs, managerKey]);

  const selectedPoint = points.find((p) => p.date === selected) ?? null;
  const spanMonths = dateFrom.slice(0, 7) !== dateTo.slice(0, 7);
  const chartData = points.map((p) => ({
    ...p,
    label: spanMonths ? p.date.slice(5) : p.date.slice(8),
  }));
  const totals = points.reduce(
    (acc, p) => ({
      expandCount: acc.expandCount + p.expandCount,
      qualifiedCount: acc.qualifiedCount + p.qualifiedCount,
    }),
    { expandCount: 0, qualifiedCount: 0 }
  );
  const qualifyRate =
    totals.expandCount > 0
      ? (totals.qualifiedCount / totals.expandCount) * 100
      : 0;

  return (
    <PageShell>
      <PageHeader
        title="每日绩效"
        kicker={viewerRole === "MANAGER" ? "本团队" : "支付宝 N7"}
        meta={
          <p className="text-sm text-[#64748b]">
            <span className="sm:hidden">蓝柱=开单数，橙柱=已达标。</span>
            <span className="hidden sm:inline">
              按注册日：蓝柱为开单数，橙柱为已达标（当前状态）。
            </span>
          </p>
        }
        actions={
          <N7DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(next) => {
              const params = new URLSearchParams(searchParams.toString());
              applyN7DateRangeToParams(params, next.dateFrom, next.dateTo);
              router.replace(`${n7Path("/daily")}?${params}`, { scroll: false });
            }}
          />
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && <p className="text-sm text-[#94a3b8]">加载中…</p>}

      {!loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="rounded-[12px] border border-[#eef2f7] bg-white px-4 py-3 shadow-sm">
              <p className="text-[0.72rem] text-[#94a3b8]">开单数</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#2563eb]">
                {totals.expandCount.toLocaleString()}
              </p>
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">
                注册日 {dateFrom} ~ {dateTo}
              </p>
            </div>
            <div className="rounded-[12px] border border-[#fed7aa] bg-white px-4 py-3 shadow-sm">
              <p className="text-[0.72rem] text-[#94a3b8]">已达标</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#ea580c]">
                {totals.qualifiedCount.toLocaleString()}
              </p>
              <p className="mt-1 text-[0.68rem] text-[#94a3b8]">
                达标率 {qualifyRate.toFixed(1)}% · 当前状态
              </p>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-3 sm:p-4 shadow-sm h-[280px] sm:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
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
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  width={28}
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
                    name === "expandCount" ? "开单数" : "已达标",
                  ]}
                />
                <Legend
                  formatter={(value) =>
                    value === "expandCount" ? "开单数" : "已达标"
                  }
                />
                <Bar
                  dataKey="expandCount"
                  name="expandCount"
                  fill={COLOR_PENDING}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="qualifiedCount"
                  name="qualifiedCount"
                  fill={COLOR_QUALIFIED}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {selectedPoint ? (
            <div className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm text-sm">
              <p className="font-medium text-[#111827]">{selectedPoint.date}</p>
              <p className="mt-2 text-[#64748b]">
                开单数 {selectedPoint.expandCount} · 已达标{" "}
                {selectedPoint.qualifiedCount}
                {selectedPoint.expandCount > 0
                  ? ` · 达标率 ${Math.round(
                      (selectedPoint.qualifiedCount / selectedPoint.expandCount) *
                        100
                    )}%`
                  : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#94a3b8]">点击某日柱形可看明细</p>
          )}
        </div>
      )}
    </PageShell>
  );
}
