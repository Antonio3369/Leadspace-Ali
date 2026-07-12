"use client";

import { COLORS } from "@/lib/constants";

export interface ManagerTeamRankingItem {
  rank: number;
  managerId: string;
  managerName: string;
  teamId: string;
  memberCount: number;
  monthlyExpand: number;
  riskComplianceRate: number;
  riskPassedCount: number;
  riskUnderReview: number;
  riskReviewActivated: number;
  estimatedRiskRate: number;
  riskNonCompliant: number;
}

/** 排名表指标配色 */
const METRIC_COLORS = {
  memberCount: COLORS.primary,       // 蓝色
  expand: "#1D2129",                 // 黑色
  riskCompliance: COLORS.success,    // 绿色
  riskUnderReview: COLORS.warning,   // 黄色
  riskReviewActivated: "#95DE64",    // 浅绿色
  estimatedRisk: "#FAAD14",            // 浅黄色
  riskNonCompliant: COLORS.danger,   // 红色
} as const;

interface ManagerTeamRankingTableProps {
  monthLabel: string;
  data: ManagerTeamRankingItem[];
  highlightManagerName?: string;
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
  { key: "memberCount", label: "团队人数", suffix: "", colorKey: "memberCount" as const },
  { key: "monthlyExpand", label: "拓展数", suffix: "", colorKey: "expand" as const },
  { key: "riskComplianceRate", label: "风控达标率", suffix: "%", colorKey: "riskCompliance" as const },
  { key: "riskPassedCount", label: "风控审核通过", suffix: "", colorKey: "riskCompliance" as const },
  { key: "riskUnderReview", label: "风控审核中", suffix: "", colorKey: "riskUnderReview" as const },
  { key: "riskReviewActivated", label: "审核中已动销", suffix: "", colorKey: "riskReviewActivated" as const },
  { key: "estimatedRiskRate", label: "预估风控达标率", suffix: "%", colorKey: "estimatedRisk" as const },
  { key: "riskNonCompliant", label: "风控不达标", suffix: "", colorKey: "riskNonCompliant" as const },
];

export function ManagerTeamRankingTable({
  monthLabel,
  data,
  highlightManagerName,
}: ManagerTeamRankingTableProps) {
  const colSpan = 2 + COLUMNS.length;

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#eef2f7] flex items-center justify-center gap-3">
        <h3 className="text-sm font-medium text-[#111827]">
          经理团队拓展排名
        </h3>
        <span className="text-xs text-[#94a3b8]">{monthLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-[#64748b]">
            <tr>
              <th className="text-center px-3 py-3 w-14">排名</th>
              <th className="text-center px-3 py-3 min-w-[88px]">区域经理</th>
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
              data.map((row) => {
                const isHighlight = highlightManagerName === row.managerName;
                return (
                  <tr
                    key={row.managerId}
                    className={`border-t border-[#f1f5f9] ${
                      isHighlight ? "bg-[#eff6ff]/60" : "hover:bg-[#f8fafc]/60"
                    }`}
                  >
                    <td className="px-3 py-3 text-center">
                      <RankBadge rank={row.rank} />
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-[#111827] whitespace-nowrap">
                      {row.managerName}
                      {isHighlight && (
                        <span className="ml-1 text-xs text-[#2563eb]">（我）</span>
                      )}
                    </td>
                    {COLUMNS.map((col) => {
                      const raw = row[col.key as keyof ManagerTeamRankingItem];
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
