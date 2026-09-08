"use client";
import { getFetchErrorMessage } from "@/lib/fetch-json";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readXlvApiCache } from "@/lib/xlv-api-cache";
import { fetchXlvJson } from "@/lib/xlv-fetch";
import { xlvPath } from "@/lib/business-lines";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import {
  NotionAlert,
  NotionCallout,
  NotionInput,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import {
  XlvLeaderboardTable,
  XlvSummaryStrip,
} from "@/components/xlv/XlvLeaderboardTable";
import { XlvBoardSortBar } from "@/components/xlv/XlvBoardSortBar";
import type { XlvBoardRow } from "@/services/xlv/board";
import { parseXlvQualificationStatus } from "@/lib/xlv-rules";
import {
  compareXlvBoardViewRows,
  parseXlvBoardViewSort,
  type XlvBoardViewSort,
} from "@/components/xlv/xlv-board-view-sort";

interface ApiResponse {
  rows: XlvBoardRow[];
  summary: {
    managerCount: number;
    deviceCount: number;
    deployedCount: number;
    inventoryCount: number;
    qualifiedCount: number;
    inProgressCount?: number;
    invalidCount?: number;
    qualifyRate: number;
    compliantCount: number;
    complianceRate: number;
    complianceGapCount: number;
    toleranceRemainingCount: number;
  };
}

export function XlvManagerBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const statusFilter = parseXlvQualificationStatus(searchParams.get("status"));
  const sort = parseXlvBoardViewSort(searchParams.get("sort"));

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(search);

  useRestoreListScroll(pathname, !loading && !!data);

  function pushQuery(patch: {
    search?: string;
    status?: string | null;
    sort?: XlvBoardViewSort | null;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.search != null) {
      if (patch.search) params.set("search", patch.search);
      else params.delete("search");
    }
    if (patch.status !== undefined) {
      if (patch.status) params.set("status", patch.status);
      else params.delete("status");
    }
    if (patch.sort !== undefined) {
      if (patch.sort && patch.sort !== "compliance") {
        params.set("sort", patch.sort);
      } else {
        params.delete("sort");
      }
    }
    router.replace(`${xlvPath("/board")}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    // URL search is the source of truth when navigating browser history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== search) pushQuery({ search: searchDraft });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const url = `/api/xlv/board?${params}`;

    const cached = readXlvApiCache<ApiResponse>(url);
    const delayMs = cached ? 0 : 200;
    const startTimer = window.setTimeout(() => {
      if (cached) {
        setData(cached);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");
      fetchXlvJson<ApiResponse>(url, {
        context: "加载经理榜",
        maxAttempts: 3,
        retryDelayMs: 800,
      })
        .then((json) => {
          if (!cancelled) setData(json);
        })
        .catch((err) => {
          if (!cancelled) setError(getFetchErrorMessage(err, "加载失败"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [search]);

  const filteredRows =
    data?.rows.filter((r) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (statusFilter === "qualified") return r.qualifiedCount > 0;
      if (statusFilter === "in_progress") return r.inProgressCount > 0;
      if (statusFilter === "invalid") return r.invalidCount > 0;
      return true;
    }) ?? [];
  const sortedRows = [...filteredRows].sort((a, b) =>
    compareXlvBoardViewRows(a, b, sort)
  );

  return (
    <PageShell>
      <PageHeader
        title="团队看板"
        kicker="微信小绿盒"
        meta={
          statusFilter ? (
            <div className="space-y-1 text-sm text-[#64748b]">
              <p>
                <button
                  type="button"
                  onClick={() => pushQuery({ status: null })}
                  className="text-[#2563eb] hover:text-[#1d4ed8] font-medium"
                >
                  ← 清除考核筛选
                </button>
              </p>
            </div>
          ) : undefined
        }
        actions={
          <NotionInput
            placeholder="搜索经理"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="w-full sm:w-52"
            aria-label="搜索经理"
          />
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}

      {!loading && data && data.summary.deviceCount === 0 ? (
        <NotionCallout>暂无设备数据，请先导入运营表。</NotionCallout>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : data ? (
        <div className="space-y-4">
          <XlvSummaryStrip
            summary={data.summary}
            showInvalid={false}
            scope="org"
          />
          <XlvBoardSortBar
            sort={sort}
            ariaLabel="经理名单看重点"
            onChange={(next) => pushQuery({ sort: next })}
          />
          <XlvLeaderboardTable
            rows={sortedRows}
            mode="managers"
            statusFilter={statusFilter}
            viewSort={sort}
          />
        </div>
      ) : null}
    </PageShell>
  );
}
