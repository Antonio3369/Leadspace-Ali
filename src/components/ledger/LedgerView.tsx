"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SegmentFilterRow } from "@/components/ui/SegmentFilterRow";
import { SalesStatusLegend } from "@/components/ledger/SalesStatusLegend";
import {
  LEDGER_QUICK_FILTERS,
  LEDGER_STATUS_TONE_CLASS,
  PHOTO_FILTER_OPTIONS,
  PHOTO_LABELS,
  RISK_FILTER_OPTIONS,
  RISK_LABELS,
  SALES_FILTER_OPTIONS,
  SALES_LABELS,
  photoStatusTone,
  riskStatusTone,
  salesStatusTone,
} from "@/lib/ledger-labels";
import {
  getCurrentMonthRange,
  getPresetRange,
  type LedgerDatePreset,
} from "@/lib/ledger-date";
import {
  EMPTY_LEDGER_STATUS_FILTERS,
  buildLedgerUrlSearchParams,
  hasActiveLedgerStatusFilters,
  ledgerUrlQueryString,
  parseLedgerUrlFilters,
  type LedgerUrlFilters,
} from "@/lib/ledger-url";
import type { LedgerSummary } from "@/services/stats/analytics";
import {
  DateFilterBar,
  NotionAlert,
  NotionButton,
  NotionInput,
  NotionSelect,
  PageHeader,
  PageShell,
  notion,
  presetButtonClass,
} from "@/components/ui/notion";

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

const EMPTY_SUMMARY: LedgerSummary = {
  risk: { PENDING: 0, PASSED: 0, FAILED: 0 },
  photo: { PENDING: 0, APPROVED: 0, REJECTED: 0 },
  sales: { NOT_ACTIVATED: 0, IN_PROGRESS: 0, ACTIVATED: 0 },
};

function StatusText({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof LEDGER_STATUS_TONE_CLASS;
}) {
  return <span className={LEDGER_STATUS_TONE_CLASS[tone]}>{label}</span>;
}

function LedgerSummaryBar({ total, summary }: { total: number; summary: LedgerSummary }) {
  return (
    <div className="rounded-[10px] border border-[#eef2f7] bg-[#f8fafc] px-3 py-2.5 text-xs text-[#64748b] space-y-1.5">
      <p className="font-medium text-[#111827]">当前筛选共 {total.toLocaleString()} 条</p>
      <p>
        风控：通过 {summary.risk.PASSED.toLocaleString()} · 审核中{" "}
        {summary.risk.PENDING.toLocaleString()} · 不通过 {summary.risk.FAILED.toLocaleString()}
      </p>
      <p>
        动销：已动销 {summary.sales.ACTIVATED.toLocaleString()} · 待达标{" "}
        {summary.sales.IN_PROGRESS.toLocaleString()} · 未动销{" "}
        {summary.sales.NOT_ACTIVATED.toLocaleString()}
      </p>
    </div>
  );
}

interface StaffOption {
  id: string;
  name: string;
}

interface ManagerOption {
  id: string;
  name: string;
}

export function LedgerView({
  showTeamColumn = false,
  showManagerFilter = false,
  showSalesUserFilter = false,
}: {
  showTeamColumn?: boolean;
  showManagerFilter?: boolean;
  showSalesUserFilter?: boolean;
}) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const defaultRange = useMemo(() => getCurrentMonthRange(), []);

  const filters = useMemo(
    () => parseLedgerUrlFilters(urlSearchParams, defaultRange),
    [urlSearchParams, defaultRange]
  );

  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<LedgerSummary>(EMPTY_SUMMARY);
  const [exportLimit, setExportLimit] = useState(50_000);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);

  const pushFilters = useCallback(
    (patch: Partial<LedgerUrlFilters>) => {
      const next = { ...filters, ...patch };
      router.replace(`/ledger${ledgerUrlQueryString(next)}`, { scroll: false });
    },
    [filters, router]
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== filters.search) {
        pushFilters({ search: searchDraft, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, pushFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = buildLedgerUrlSearchParams(filters);
    params.set("pageSize", "20");
    params.set("sortBy", "expandDate");
    params.set("sortOrder", "desc");

    const res = await fetch(`/api/ledger?${params}`);
    const data = await res.json();
    setRecords(data.records ?? []);
    setTotal(data.total ?? 0);
    setSummary(data.summary ?? EMPTY_SUMMARY);
    setExportLimit(data.exportLimit ?? 50_000);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showSalesUserFilter) {
      setStaffOptions([]);
      return;
    }

    let cancelled = false;

    async function loadStaff() {
      const res = await fetch("/api/admin/team");
      if (!res.ok || cancelled) return;

      const data = await res.json();
      const roster = (data.roster ?? []) as Array<{ id: string; name: string; status: string }>;
      const options = roster
        .filter((member) => member.status === "ACTIVE")
        .map((member) => ({ id: member.id, name: member.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

      if (!cancelled) setStaffOptions(options);
    }

    loadStaff();
    return () => {
      cancelled = true;
    };
  }, [showSalesUserFilter]);

  useEffect(() => {
    if (!showManagerFilter) {
      setManagerOptions([]);
      return;
    }

    let cancelled = false;

    async function loadManagers() {
      const res = await fetch("/api/admin/users");
      if (!res.ok || cancelled) return;

      const data = await res.json();
      const users = (data.users ?? []) as Array<{ id: string; name: string; role: string; status: string }>;
      const options = users
        .filter((user) => user.role === "MANAGER" && user.status === "ACTIVE")
        .map((user) => ({ id: user.id, name: user.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

      if (!cancelled) setManagerOptions(options);
    }

    loadManagers();
    return () => {
      cancelled = true;
    };
  }, [showManagerFilter]);

  function applyPreset(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    pushFilters({
      datePreset: preset,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      page: 1,
    });
  }

  function isQuickFilterActive(key: (typeof LEDGER_QUICK_FILTERS)[number]["key"]) {
    const preset = LEDGER_QUICK_FILTERS.find((item) => item.key === key);
    if (!preset) return false;
    return (
      filters.riskStatus === preset.filters.riskStatus &&
      filters.photoStatus === preset.filters.photoStatus &&
      filters.salesStatus === preset.filters.salesStatus
    );
  }

  async function handleExport() {
    setExporting(true);
    setExportError("");

    const params = buildLedgerUrlSearchParams(filters);
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
  const { dateFrom, dateTo, datePreset, riskStatus, photoStatus, salesStatus, managerId, salesUserId, page } =
    filters;
  const showFailReasonColumn = riskStatus === "FAILED" || summary.risk.FAILED > 0;
  const columnCount = 8 + (showTeamColumn ? 1 : 0) + (showFailReasonColumn ? 1 : 0);
  const exportBlocked = total > exportLimit;

  return (
    <PageShell>
      <PageHeader
        title="风控台账"
        kicker=""
        meta={
          <p>
            当前筛选 {total.toLocaleString()} 条
            {exportBlocked
              ? ` · 超出导出上限 ${exportLimit.toLocaleString()} 条，请缩小范围`
              : " · 可导出当前筛选结果"}
          </p>
        }
        actions={
          <NotionButton
            onClick={handleExport}
            disabled={exporting || loading || exportBlocked || total === 0}
          >
            {exporting ? "导出中..." : "导出 Excel"}
          </NotionButton>
        }
      />

      {exportError && <NotionAlert tone="error">{exportError}</NotionAlert>}

      <DateFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        datePreset={datePreset}
        onPreset={applyPreset}
        onDateFrom={(value) => pushFilters({ dateFrom: value, datePreset: "custom", page: 1 })}
        onDateTo={(value) => pushFilters({ dateTo: value, datePreset: "custom", page: 1 })}
        trailing={
          <>
            <NotionInput
              type="text"
              placeholder="搜索商家/作业编号/业务员"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="w-full sm:w-64"
            />
            {showManagerFilter && (
              <NotionSelect
                value={managerId}
                onChange={(e) => pushFilters({ managerId: e.target.value, page: 1 })}
              >
                <option value="">全部经理</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
              </NotionSelect>
            )}
            {showSalesUserFilter && (
              <NotionSelect
                value={salesUserId}
                onChange={(e) => pushFilters({ salesUserId: e.target.value, page: 1 })}
              >
                <option value="">全部业务员</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </NotionSelect>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[#64748b] w-16 shrink-0">快捷</span>
        {LEDGER_QUICK_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => pushFilters({ ...item.filters, page: 1 })}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${presetButtonClass(isQuickFilterActive(item.key))}`}
          >
            {item.label}
          </button>
        ))}
        {hasActiveLedgerStatusFilters(filters) && (
          <button
            type="button"
            onClick={() => pushFilters({ ...EMPTY_LEDGER_STATUS_FILTERS })}
            className="px-3 py-1.5 text-xs rounded-lg border border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1] bg-white"
          >
            清除筛选
          </button>
        )}
      </div>

      <div className={`space-y-2 ${notion.panel} px-3 py-3`}>
        <SegmentFilterRow
          label="风控"
          value={riskStatus}
          options={RISK_FILTER_OPTIONS.map(({ value, label }) => ({ value, label }))}
          onChange={(value) => pushFilters({ riskStatus: value, page: 1 })}
        />
        <SegmentFilterRow
          label="照片"
          value={photoStatus}
          options={PHOTO_FILTER_OPTIONS.map(({ value, label }) => ({ value, label }))}
          onChange={(value) => pushFilters({ photoStatus: value, page: 1 })}
        />
        <SegmentFilterRow
          label="动销"
          value={salesStatus}
          options={SALES_FILTER_OPTIONS.map(({ value, label }) => ({ value, label }))}
          onChange={(value) => pushFilters({ salesStatus: value, page: 1 })}
        />
      </div>

      <SalesStatusLegend />

      {!loading && total > 0 && <LedgerSummaryBar total={total} summary={summary} />}

      <div className={notion.tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={notion.thead}>
              <tr>
                <th className="text-left px-3 py-3">作业编号</th>
                <th className="text-left px-3 py-3">商家名称</th>
                <th className="text-left px-3 py-3">业务员</th>
                {showTeamColumn && <th className="text-left px-3 py-3">团队</th>}
                <th className="text-left px-3 py-3">商机</th>
                <th className="text-left px-3 py-3">风控状态</th>
                <th className="text-left px-3 py-3">照片状态</th>
                <th className="text-left px-3 py-3">动销进度</th>
                {showFailReasonColumn && (
                  <th className="text-left px-3 py-3">不通过原因</th>
                )}
                <th className="text-left px-3 py-3">拓展日期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columnCount} className="text-center py-8 text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="text-center py-8 text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className={notion.row}>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.jobNumber}</td>
                    <td className="px-3 py-2.5">{r.merchantName}</td>
                    <td className="px-3 py-2.5">{r.salesUserName}</td>
                    {showTeamColumn && (
                      <td className="px-3 py-2.5">{r.team?.name ?? "-"}</td>
                    )}
                    <td className="px-3 py-2.5">{r.opportunity?.name ?? r.opportunityName ?? "-"}</td>
                    <td className="px-3 py-2.5">
                      <StatusText
                        label={RISK_LABELS[r.riskStatus] ?? r.riskStatus}
                        tone={riskStatusTone(r.riskStatus)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusText
                        label={PHOTO_LABELS[r.photoStatus] ?? r.photoStatus}
                        tone={photoStatusTone(r.photoStatus)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusText
                        label={SALES_LABELS[r.salesActivationStatus] ?? r.salesActivationStatus}
                        tone={salesStatusTone(r.salesActivationStatus)}
                      />
                    </td>
                    {showFailReasonColumn && (
                      <td
                        className="px-3 py-2.5 text-gray-500 max-w-[160px] truncate"
                        title={r.riskFailReason ?? ""}
                      >
                        {r.riskStatus === "FAILED" ? (r.riskFailReason ?? "-") : "-"}
                      </td>
                    )}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#eef2f7]">
            <span className="text-sm text-[#64748b]">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <NotionButton
                variant="ghost"
                disabled={page <= 1}
                onClick={() => pushFilters({ page: page - 1 })}
              >
                上一页
              </NotionButton>
              <NotionButton
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => pushFilters({ page: page + 1 })}
              >
                下一页
              </NotionButton>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
