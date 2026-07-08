"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { PHOTO_LABELS, RISK_LABELS, SALES_FILTER_OPTIONS, SALES_LABELS, SALES_STATUS_HINT } from "@/lib/ledger-labels";
import {
  formatDateRangeLabel,
  getCurrentMonthRange,
  getPresetRange,
  type LedgerDatePreset,
} from "@/lib/ledger-date";
import {
  buildLedgerUrlSearchParams,
  ledgerUrlQueryString,
  parseLedgerUrlFilters,
} from "@/lib/ledger-url";

interface LedgerRecord {
  id: string;
  jobNumber: string;
  merchantName: string;
  salesUserName: string;
  team: { name: string } | null;
  opportunity: { name: string } | null;
  opportunityName: string | null;
  photoStatus: string;
  riskStatus: string;
  salesActivationStatus: string;
  riskFailReason: string | null;
  expandDate: string;
}

const DATE_PRESETS: { key: LedgerDatePreset; label: string }[] = [
  { key: "month", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "30d", label: "近30天" },
  { key: "90d", label: "近90天" },
  { key: "all", label: "全部" },
];

const RISK_FILTER_OPTIONS = [
  { value: "PENDING", label: "审核中" },
  { value: "PASSED", label: "通过" },
  { value: "FAILED", label: "不通过" },
];

export function LedgerView() {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const defaultRange = useMemo(() => getCurrentMonthRange(), []);
  const initializedRef = useRef(false);

  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [riskStatuses, setRiskStatuses] = useState<string[]>([]);
  const [salesStatuses, setSalesStatuses] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [datePreset, setDatePreset] = useState<LedgerDatePreset>("month");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const parsed = parseLedgerUrlFilters(urlSearchParams, defaultRange);
    setPage(parsed.page);
    setSearch(parsed.search);
    setRiskStatuses(parsed.riskStatuses);
    setSalesStatuses(parsed.salesStatuses);
    setDateFrom(parsed.dateFrom);
    setDateTo(parsed.dateTo);
    setDatePreset(parsed.datePreset);
    initializedRef.current = true;
  }, [urlSearchParams, defaultRange]);

  const urlFilters = useMemo(
    () => ({
      dateFrom,
      dateTo,
      datePreset,
      search,
      riskStatuses,
      salesStatuses,
      page,
    }),
    [dateFrom, dateTo, datePreset, search, riskStatuses, salesStatuses, page]
  );

  useEffect(() => {
    if (!initializedRef.current) return;

    const nextQuery = ledgerUrlQueryString(urlFilters);
    const currentQuery = urlSearchParams.toString();
    const normalizedCurrent = currentQuery ? `?${currentQuery}` : "";

    if (nextQuery !== normalizedCurrent) {
      router.replace(`/ledger${nextQuery}`, { scroll: false });
    }
  }, [urlFilters, router, urlSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = buildLedgerUrlSearchParams(urlFilters);
    params.set("pageSize", "20");
    params.set("sortBy", "expandDate");
    params.set("sortOrder", "desc");

    const res = await fetch(`/api/ledger?${params}`);
    const data = await res.json();
    setRecords(data.records ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [urlFilters]);

  useEffect(() => {
    if (!initializedRef.current) return;
    load();
  }, [load]);

  function applyPreset(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    setDatePreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setPage(1);
  }

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    setDatePreset("custom");
    setPage(1);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    setDatePreset("custom");
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    setExportError("");

    const params = buildLedgerUrlSearchParams(urlFilters);
    params.set("sortBy", "expandDate");
    params.set("sortOrder", "desc");

    try {
      const res = await fetch(`/api/ledger/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "导出失败");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match ? decodeURIComponent(match[1]!) : "风控台账.xlsx";

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

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">风控台账</h1>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#165DFF] rounded-lg hover:bg-[#165DFF]/90 disabled:opacity-50 transition-colors"
        >
          {exporting ? "导出中..." : "导出 Excel"}
        </button>
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
            onChange={(e) => handleDateFromChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30"
          />
          <span className="text-sm text-gray-400">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30"
          />
          <input
            type="text"
            placeholder="搜索商家/作业编号/业务员"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30"
          />
          <MultiSelectFilter
            placeholder="全部审核状态"
            options={RISK_FILTER_OPTIONS}
            values={riskStatuses}
            onChange={(values) => {
              setRiskStatuses(values);
              setPage(1);
            }}
          />
          <MultiSelectFilter
            placeholder="全部动销进度"
            options={[...SALES_FILTER_OPTIONS]}
            values={salesStatuses}
            onChange={(values) => {
              setSalesStatuses(values);
              setPage(1);
            }}
          />
        </div>

        <p className="text-xs text-gray-500">{SALES_STATUS_HINT}</p>

        <p className="text-sm text-gray-500">
          {formatDateRangeLabel(dateFrom, dateTo)} · 共 {total.toLocaleString()} 条
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-3">作业编号</th>
                <th className="text-left px-3 py-3">商家名称</th>
                <th className="text-left px-3 py-3">业务员</th>
                <th className="text-left px-3 py-3">团队</th>
                <th className="text-left px-3 py-3">商机</th>
                <th className="text-left px-3 py-3">照片</th>
                <th className="text-left px-3 py-3">风控</th>
                <th className="text-left px-3 py-3">动销进度</th>
                <th className="text-left px-3 py-3">不通过原因</th>
                <th className="text-left px-3 py-3">拓展日期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 font-mono text-xs">{r.jobNumber}</td>
                    <td className="px-3 py-2.5">{r.merchantName}</td>
                    <td className="px-3 py-2.5">{r.salesUserName}</td>
                    <td className="px-3 py-2.5">{r.team?.name ?? "-"}</td>
                    <td className="px-3 py-2.5">{r.opportunity?.name ?? r.opportunityName ?? "-"}</td>
                    <td className="px-3 py-2.5">{PHOTO_LABELS[r.photoStatus] ?? r.photoStatus}</td>
                    <td className="px-3 py-2.5">{RISK_LABELS[r.riskStatus] ?? r.riskStatus}</td>
                    <td className="px-3 py-2.5">
                      {SALES_LABELS[r.salesActivationStatus] ?? r.salesActivationStatus}
                    </td>
                    <td
                      className="px-3 py-2.5 text-gray-500 max-w-[160px] truncate"
                      title={r.riskFailReason ?? ""}
                    >
                      {r.riskFailReason ?? "-"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {new Date(r.expandDate).toLocaleDateString("zh-CN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40"
              >
                上一页
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
