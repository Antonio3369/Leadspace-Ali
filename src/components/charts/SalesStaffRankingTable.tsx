"use client";

import { COLORS } from "@/lib/constants";

export interface SalesStaffRankingItem {
  rank: number;
  salesUserId: string;
  salesName: string;
  monthlyExpand: number;
  riskComplianceRate: number;
  riskPassedCount: number;
  riskUnderReview: number;
  riskReviewActivated: number;
  estimatedRiskRate: number;
  riskNonCompliant: number;
}

const METRIC_COLORS = {
  expand: "#1D2129",
  riskCompliance: COLORS.success,
  riskUnderReview: COLORS.warning,
  riskReviewActivated: "#95DE64",
  estimatedRisk: "#FAAD14",
  riskNonCompliant: COLORS.danger,
} as const;

interface SalesStaffRankingTableProps {
  title?: string;
  monthLabel: string;
  data: SalesStaffRankingItem[];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-500 font-bold">🥇 {rank}</span>;
  if (rank === 2) return <span className="text-gray-400 font-bold">🥈 {rank}</span>;
  if (rank === 3) return <span className="text-orange-400 font-bold">🥉 {rank}</span>;
  return <span className="text-gray-500">{rank}</span>;
}

function MetricCell({
  value,
  color,
  suffix = "",
}: {
  value: number | string;
  color: string;
  suffix?: string;
}) {
  return (
    <td className="px-3 py-3 text-center tabular-nums">
      <span className="font-semibold" style={{ color }}>
        {value}
        {suffix}
      </span>
    </td>
  );
}

const COLUMNS = [
  { key: "monthlyExpand", label: "拓展数", suffix: "", colorKey: "expand" as const },
  { key: "riskComplianceRate", label: "风控达标率", suffix: "%", colorKey: "riskCompliance" as const },
  { key: "riskPassedCount", label: "风控审核通过", suffix: "", colorKey: "riskCompliance" as const },
  { key: "riskUnderReview", label: "风控审核中", suffix: "", colorKey: "riskUnderReview" as const },
  { key: "riskReviewActivated", label: "审核中已动销", suffix: "", colorKey: "riskReviewActivated" as const },
  { key: "estimatedRiskRate", label: "预估风控达标率", suffix: "%", colorKey: "estimatedRisk" as const },
  { key: "riskNonCompliant", label: "风控不达标", suffix: "", colorKey: "riskNonCompliant" as const },
];

export function SalesStaffRankingTable({
  title = "业务人员拓展排名",
  monthLabel,
  data,
}: SalesStaffRankingTableProps) {
  const colSpan = 2 + COLUMNS.length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-center gap-3">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">{monthLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-center px-3 py-3 w-14">排名</th>
              <th className="text-center px-3 py-3 min-w-[88px]">业务员</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="text-center px-3 py-3 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-8 text-gray-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.salesUserId}
                  className="border-t border-gray-50 hover:bg-gray-50/50"
                >
                  <td className="px-3 py-3 text-center">
                    <RankBadge rank={row.rank} />
                  </td>
                  <td className="px-3 py-3 text-center font-medium text-gray-900 whitespace-nowrap">
                    {row.salesName}
                  </td>
                  {COLUMNS.map((col) => {
                    const raw = row[col.key as keyof SalesStaffRankingItem];
                    const display =
                      typeof raw === "number" && col.suffix === "%"
                        ? raw.toFixed(1)
                        : typeof raw === "number"
                          ? raw.toLocaleString()
                          : raw;
                    return (
                      <MetricCell
                        key={col.key}
                        value={display}
                        color={METRIC_COLORS[col.colorKey]}
                        suffix={col.suffix}
                      />
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
