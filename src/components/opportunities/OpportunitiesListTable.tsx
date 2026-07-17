"use client";

import { getRateColorLevel } from "@/lib/business-rules";
import { COLORS } from "@/lib/constants";
import type { OpportunityListItem } from "@/services/stats/analytics";
import { NotionLinkButton } from "@/components/ui/notion";

function rateColor(rate: number) {
  const level = getRateColorLevel(rate);
  if (level === "success") return COLORS.success;
  if (level === "warning") return COLORS.warning;
  return COLORS.danger;
}

interface OpportunitiesListTableProps {
  data: OpportunityListItem[];
  viewQuery?: string;
}

export function OpportunitiesListTable({ data, viewQuery = "" }: OpportunitiesListTableProps) {
  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-[#64748b]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">商机名称</th>
              <th className="text-right px-4 py-3 font-medium">拓展数</th>
              <th className="text-right px-4 py-3 font-medium">照片通过率</th>
              <th className="text-right px-4 py-3 font-medium">动销通过率</th>
              <th className="text-right px-4 py-3 font-medium">当前风控达标率</th>
              <th className="text-right px-4 py-3 font-medium">预估风控达标率</th>
              <th className="text-center px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="border-t border-[#f1f5f9] hover:bg-[#f8fafc]/60">
                  <td className="px-4 py-3 font-medium text-[#111827]">{row.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.totalMerchants.toLocaleString()}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: rateColor(row.photoPassRate) }}
                  >
                    {row.photoPassRate.toFixed(1)}%
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: rateColor(row.salesActivationRate) }}
                  >
                    {row.salesActivationRate.toFixed(1)}%
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: rateColor(row.riskComplianceRate) }}
                  >
                    {row.riskComplianceRate.toFixed(1)}%
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    style={{ color: rateColor(row.estimatedRiskRate) }}
                  >
                    {row.estimatedRiskRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <NotionLinkButton href={`/xlh/opportunities/${encodeURIComponent(row.id)}${viewQuery}`}>
                      详情
                    </NotionLinkButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
