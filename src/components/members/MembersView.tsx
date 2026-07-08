"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ROLE_LABELS } from "@/lib/constants";
import { getRateColorLevel } from "@/lib/business-rules";
import { COLORS } from "@/lib/constants";
import {
  formatDateRangeLabel,
  getCurrentMonthRange,
  getPresetRange,
  type LedgerDatePreset,
} from "@/lib/ledger-date";

interface MemberMetrics {
  totalMerchants: number;
  photoPassRate: number;
  salesActivationRate: number;
  riskComplianceRate: number;
  estimatedRiskRate: number;
}

interface MemberRow {
  id: string;
  name: string;
  role: string;
  teamName?: string;
  managerName?: string;
  metrics: MemberMetrics;
}

const DATE_PRESETS: { key: LedgerDatePreset; label: string }[] = [
  { key: "month", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "30d", label: "近30天" },
  { key: "90d", label: "近90天" },
  { key: "all", label: "全部" },
];

function rateColor(rate: number) {
  const level = getRateColorLevel(rate);
  if (level === "success") return COLORS.success;
  if (level === "warning") return COLORS.warning;
  return COLORS.danger;
}

function MetricsCells({ metrics }: { metrics: MemberMetrics }) {
  return (
    <>
      <td className="px-4 py-3 text-right tabular-nums">{metrics.totalMerchants.toLocaleString()}</td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ color: rateColor(metrics.photoPassRate) }}>
        {metrics.photoPassRate.toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ color: rateColor(metrics.salesActivationRate) }}>
        {metrics.salesActivationRate.toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ color: rateColor(metrics.riskComplianceRate) }}>
        {metrics.riskComplianceRate.toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ color: rateColor(metrics.estimatedRiskRate) }}>
        {metrics.estimatedRiskRate.toFixed(1)}%
      </td>
    </>
  );
}

function appendDateParams(params: URLSearchParams, dateFrom: string, dateTo: string) {
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
}

export function MembersView() {
  const defaultRange = getCurrentMonthRange();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [listType, setListType] = useState<"managers" | "staff" | "members">("members");
  const [canExport, setCanExport] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [datePreset, setDatePreset] = useState<LedgerDatePreset>("month");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const isManagerList = listType === "managers";
  const isStaffList = listType === "staff";
  const showDetailLink = isManagerList || isStaffList;
  const showOrgColumns = listType === "members";

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    appendDateParams(params, dateFrom, dateTo);

    const res = await fetch(`/api/members?${params}`);
    const data = await res.json();
    setListType(data.listType ?? "members");
    setCanExport(Boolean(data.canExport));
    setMembers(data.members ?? []);
    setLoading(false);
  }, [search, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  function applyPreset(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    setDatePreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  }

  function buildDetailHref(id: string) {
    const params = new URLSearchParams();
    appendDateParams(params, dateFrom, dateTo);
    const q = params.toString();
    return `/members/${id}${q ? `?${q}` : ""}`;
  }

  async function handleExport() {
    setExporting(true);
    setExportError("");

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    appendDateParams(params, dateFrom, dateTo);

    try {
      const res = await fetch(`/api/members/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "导出失败");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match ? decodeURIComponent(match[1]!) : "人员明细.xlsx";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  const colSpan = showOrgColumns ? 10 : showDetailLink ? 8 : 7;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">人员明细</h1>
        {canExport && (
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#165DFF] rounded-lg hover:bg-[#165DFF]/90 disabled:opacity-50 transition-colors"
          >
            {exporting ? "导出中..." : "导出 Excel"}
          </button>
        )}
      </div>

      {exportError && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {exportError}
        </p>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">拓展日期</span>
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.key)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                datePreset === preset.key
                  ? "bg-[#165DFF]/10 border-[#165DFF]/30 text-[#165DFF] font-medium"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setDatePreset("custom");
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30"
          />
          <span className="text-sm text-gray-400">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setDatePreset("custom");
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30"
          />
          <input
            type="text"
            placeholder={
              isManagerList ? "搜索经理姓名" : isStaffList ? "搜索业务员姓名" : "搜索姓名或团队"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30"
          />
        </div>

        <p className="text-sm text-gray-500">
          {formatDateRangeLabel(dateFrom, dateTo)} · 共 {members.length.toLocaleString()} 人
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">姓名</th>
                <th className="text-left px-4 py-3">角色</th>
                {showOrgColumns && (
                  <>
                    <th className="text-left px-4 py-3">团队</th>
                    <th className="text-left px-4 py-3">上级</th>
                  </>
                )}
                <th className="text-right px-4 py-3">拓展数</th>
                <th className="text-right px-4 py-3">照片通过率</th>
                <th className="text-right px-4 py-3">动销通过率</th>
                <th className="text-right px-4 py-3">风控达标率</th>
                <th className="text-right px-4 py-3">预估达标率</th>
                {showDetailLink && (
                  <th className="text-center px-4 py-3">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="text-center py-8 text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="text-center py-8 text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3">
                      {isManagerList ? "经理" : (ROLE_LABELS[m.role] ?? m.role)}
                    </td>
                    {showOrgColumns && (
                      <>
                        <td className="px-4 py-3">{m.teamName}</td>
                        <td className="px-4 py-3">{m.managerName}</td>
                      </>
                    )}
                    <MetricsCells metrics={m.metrics} />
                    {showDetailLink && (
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={buildDetailHref(m.id)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-[#165DFF] border border-[#165DFF]/30 rounded-lg hover:bg-[#165DFF]/5 transition-colors"
                        >
                          详情
                        </Link>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
