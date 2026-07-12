"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SegmentFilterRow } from "@/components/ui/SegmentFilterRow";
import { getRateColorLevel } from "@/lib/business-rules";
import { COLORS } from "@/lib/constants";
import {
  formatDateRangeLabel,
  getCurrentMonthRange,
  getPresetRange,
  type LedgerDatePreset,
} from "@/lib/ledger-date";
import {
  DEFAULT_TEAM_DETAIL_SORT,
  TEAM_DETAIL_SORT_OPTIONS,
  type RankedTeamDetailRow,
  type TeamDetailSortKey,
} from "@/lib/team-details";
import {
  buildTeamDetailsUrlSearchParams,
  parseTeamDetailsUrlFilters,
  persistTeamDetailsFilters,
  resolveTeamDetailsSearchParams,
  TEAM_DETAILS_FILTERS_STORAGE_KEY,
  teamDetailsUrlQueryString,
  type TeamDetailsUrlFilters,
} from "@/lib/team-details-url";
import type { UserRole } from "@/generated/prisma/client";
import {
  DateFilterBar,
  NotionAlert,
  NotionButton,
  NotionInput,
  NotionLinkButton,
  PageHeader,
  PageShell,
  notion,
} from "@/components/ui/notion";

function rateColor(rate: number) {
  const level = getRateColorLevel(rate);
  if (level === "success") return COLORS.success;
  if (level === "warning") return COLORS.warning;
  return COLORS.danger;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-500 font-bold">🥇 {rank}</span>;
  if (rank === 2) return <span className="text-gray-400 font-bold">🥈 {rank}</span>;
  if (rank === 3) return <span className="text-orange-400 font-bold">🥉 {rank}</span>;
  return <span className="text-gray-500">{rank}</span>;
}

function MetricsCells({ metrics }: { metrics: RankedTeamDetailRow["metrics"] }) {
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

interface TeamDetailsViewProps {
  role: UserRole;
}

export function TeamDetailsView({ role }: TeamDetailsViewProps) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const defaultRange = useMemo(() => getCurrentMonthRange(), []);

  const resolvedSearchParams = useMemo(
    () => resolveTeamDetailsSearchParams(urlSearchParams),
    [urlSearchParams]
  );

  const filters = useMemo(
    () => parseTeamDetailsUrlFilters(resolvedSearchParams, defaultRange),
    [resolvedSearchParams, defaultRange]
  );

  const isDirector = role === "DIRECTOR";
  const isManager = role === "MANAGER";
  const canView = isDirector || isManager;

  const [rows, setRows] = useState<RankedTeamDetailRow[]>([]);
  const [listType, setListType] = useState<"managers" | "staff" | "none">("none");
  const [canExport, setCanExport] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const skipSearchDebounceRef = useRef(false);
  const filtersRef = useRef(filters);
  const rowsRef = useRef<RankedTeamDetailRow[]>([]);
  filtersRef.current = filters;

  const pushFilters = useCallback(
    (patch: Partial<TeamDetailsUrlFilters>) => {
      const next = { ...filtersRef.current, ...patch };
      persistTeamDetailsFilters(next);
      router.replace(`/teams${teamDetailsUrlQueryString(next)}`, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    if (urlSearchParams.toString()) return;
    const stored = sessionStorage.getItem(TEAM_DETAILS_FILTERS_STORAGE_KEY);
    if (stored && typeof window !== "undefined" && !window.location.search) {
      router.replace(`/teams?${stored}`, { scroll: false });
    }
  }, [urlSearchParams, router]);

  useEffect(() => {
    persistTeamDetailsFilters(filters);
  }, [filters]);

  useEffect(() => {
    skipSearchDebounceRef.current = true;
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (skipSearchDebounceRef.current) {
      skipSearchDebounceRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (searchDraft !== filters.search) {
        pushFilters({ search: searchDraft });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, pushFilters]);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }

    if (rowsRef.current.length === 0) setLoading(true);
    setLoadError("");
    const params = buildTeamDetailsUrlSearchParams(filters);
    const res = await fetch(`/api/teams?${params}`);
    const data = await res.json();

    if (!res.ok) {
      setListType("none");
      setCanExport(false);
      setRows([]);
      rowsRef.current = [];
      setLoadError(data.error ?? "加载失败");
      setLoading(false);
      return;
    }

    const nextRows = data.rows ?? [];
    setListType(data.listType ?? "none");
    setCanExport(Boolean(data.canExport));
    setRows(nextRows);
    rowsRef.current = nextRows;
    setLoading(false);
  }, [filters, canView]);

  useEffect(() => {
    load();
  }, [load]);

  function applyPreset(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    pushFilters({
      datePreset: preset,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    });
  }

  function buildDetailHref(id: string) {
    persistTeamDetailsFilters(filters);
    const q = buildTeamDetailsUrlSearchParams(filters).toString();
    return `/members/${id}${q ? `?${q}` : ""}`;
  }

  async function handleExport() {
    setExporting(true);
    setExportError("");

    const params = buildTeamDetailsUrlSearchParams(filters);

    try {
      const res = await fetch(`/api/teams/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "导出失败");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match ? decodeURIComponent(match[1]!) : "团队明细.xlsx";

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

  if (!canView) {
    return (
      <PageShell>
        <PageHeader title="团队明细" kicker="" />
        <div className={`${notion.panel} px-6 py-12 text-center text-[#94a3b8] text-sm`}>
          当前角色暂无可查看的团队明细
        </div>
      </PageShell>
    );
  }

  const nameColumnLabel = isDirector ? "区域经理" : "业务员";
  const colSpan = isDirector ? 9 : 8;
  const { dateFrom, dateTo, datePreset, sortBy } = filters;

  return (
    <PageShell>
      <PageHeader
        title="团队明细"
        kicker=""
        meta={
          <p>
            {formatDateRangeLabel(dateFrom, dateTo)} · 共 {rows.length.toLocaleString()} 人
            {isDirector ? "（区域经理）" : "（业务员）"}
          </p>
        }
        actions={
          canExport ? (
            <NotionButton onClick={handleExport} disabled={exporting || loading}>
              {exporting ? "导出中..." : "导出 Excel"}
            </NotionButton>
          ) : undefined
        }
      />

      {exportError && <NotionAlert tone="error">{exportError}</NotionAlert>}
      {loadError && <NotionAlert tone="error">{loadError}</NotionAlert>}

      <DateFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        datePreset={datePreset}
        onPreset={applyPreset}
        onDateFrom={(value) => pushFilters({ dateFrom: value, datePreset: "custom" })}
        onDateTo={(value) => pushFilters({ dateTo: value, datePreset: "custom" })}
        trailing={
          <NotionInput
            type="text"
            placeholder={isDirector ? "搜索经理姓名" : "搜索业务员姓名"}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="w-full sm:w-64"
          />
        }
      />

      <SegmentFilterRow
        label="排序"
        value={sortBy}
        showAllOption={false}
        options={TEAM_DETAIL_SORT_OPTIONS.map(({ value, label }) => ({ value, label }))}
        onChange={(value) =>
          pushFilters({
            sortBy: (value as TeamDetailSortKey) || DEFAULT_TEAM_DETAIL_SORT,
          })
        }
      />

      <div className={notion.tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={notion.thead}>
              <tr>
                <th className="text-center px-4 py-3 w-16">排名</th>
                <th className="text-left px-4 py-3">{nameColumnLabel}</th>
                {isDirector && <th className="text-right px-4 py-3">团队人数</th>}
                <th className="text-right px-4 py-3">拓展数</th>
                <th className="text-right px-4 py-3">照片通过率</th>
                <th className="text-right px-4 py-3">动销通过率</th>
                <th className="text-right px-4 py-3">风控达标率</th>
                <th className="text-right px-4 py-3">预估达标率</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="text-center py-8 text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="text-center py-8 text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={notion.row}>
                    <td className="px-4 py-3 text-center">
                      <RankBadge rank={row.rank} />
                    </td>
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    {isDirector && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.memberCount?.toLocaleString() ?? "-"}
                      </td>
                    )}
                    <MetricsCells metrics={row.metrics} />
                    <td className="px-4 py-3 text-center">
                      <NotionLinkButton href={buildDetailHref(row.id)}>详情</NotionLinkButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
