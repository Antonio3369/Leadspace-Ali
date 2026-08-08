"use client";

import type { XlvTxnActivityPoint } from "@/services/xlv/snapshot-daily";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = XlvTxnActivityPoint & {
  label: string;
  dormant: boolean;
};

const COLOR_TXN_ACTIVE = "#10b981";
const COLOR_TXN_DORMANT = "#f59e0b";
const COLOR_USERS = "#2563eb";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ChartPoint }[];
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-[10px] border border-[#eef2f7] bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-[#334155]">{point.date}</p>
      <p className="mt-1 tabular-nums text-[#64748b]">
        当日 {point.dailyTxns} 笔 · {point.dailyUsers} 用户
      </p>
      <p className="mt-0.5 tabular-nums text-[#94a3b8]">
        截至该日累计 {point.cumulativeTxns} 笔 · {point.cumulativeUsers} 用户
      </p>
      <p className={`mt-0.5 ${point.dormant ? "text-amber-700" : "text-emerald-700"}`}>
        沉睡 {point.sleepDays} 天{point.dormant ? "（≥2 天）" : ""}
      </p>
    </div>
  );
}

export function XlvTxnActivityChart({ points }: { points: XlvTxnActivityPoint[] }) {
  const chartData: ChartPoint[] = points.map((point) => ({
    ...point,
    label: point.date.slice(5),
    dormant: point.sleepDays >= 2,
  }));

  if (chartData.length === 0) {
    return (
      <p className="text-sm text-[#94a3b8] py-6 text-center">
        暂无收款记录；导入多日运营表后，将按有交易的日期展示笔数。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[220px] sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={28}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={28}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(37, 99, 235, 0.06)" }} />
            <Legend
              formatter={(value) =>
                value === "dailyTxns" ? "当日笔数" : "当日用户"
              }
            />
            <Bar
              yAxisId="left"
              dataKey="dailyTxns"
              name="dailyTxns"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={entry.dormant ? COLOR_TXN_DORMANT : COLOR_TXN_ACTIVE}
                />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="dailyUsers"
              name="dailyUsers"
              stroke={COLOR_USERS}
              strokeWidth={2}
              dot={{ r: 3, fill: COLOR_USERS, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[#94a3b8]">
        仅展示有收款的日期（按末笔交易日归类，非导入快照日）；绿柱=正常，橙柱=当日已沉睡 ≥2
        天。
      </p>
    </div>
  );
}
