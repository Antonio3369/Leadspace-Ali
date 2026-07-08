"use client";

import Link from "next/link";
import { getRateColorLevel } from "@/lib/business-rules";
import { COLORS } from "@/lib/constants";
import type { OpportunityListItem } from "@/services/stats/analytics";

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
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
                <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
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
                    <Link
                      href={`/opportunities/${encodeURIComponent(row.id)}${viewQuery}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-[#165DFF] border border-[#165DFF]/30 rounded-lg hover:bg-[#165DFF]/5 transition-colors"
                    >
                      详情
                    </Link>
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
