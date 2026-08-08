"use client";

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
import type { XlvBoardRow } from "@/services/xlv/board";
import { parseXlvQualificationStatus } from "@/lib/xlv-rules";

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
  };
}

export function XlvManagerBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const statusFilter = parseXlvQualificationStatus(searchParams.get("status"));

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(search);

  useRestoreListScroll(pathname, !loading && !!data);

  function pushQuery(patch: { search?: string; status?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.search != null) {
      if (patch.search) params.set("search", patch.search);
      else params.delete("search");
    }
    if (patch.status !== undefined) {
      if (patch.status) params.set("status", patch.status);
      else params.delete("status");
    }
    router.replace(`${xlvPath("/board")}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
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
    if (cached) {
      setData(cached);
      setLoading(false);
      setError("");
    } else {
      setLoading(true);
      setError("");
    }

    fetchXlvJson<ApiResponse>(url, {
      context: "加载经理榜",
      maxAttempts: 3,
      retryDelayMs: 800,
    })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
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

  return (
    <PageShell>
      <PageHeader
        title="团队看板"
        kicker="微信小绿盒"
        meta={
          <div className="space-y-1 text-sm text-[#64748b]">
            <p>按经理看沉睡与单笔沉默；点击经理下钻到队员排行。</p>
            {statusFilter ? (
              <p>
                <button
                  type="button"
                  onClick={() => pushQuery({ status: null })}
                  className="text-[#2563eb] hover:text-[#1d4ed8] font-medium"
                >
                  ← 清除考核筛选
                </button>
              </p>
            ) : null}
          </div>
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
          <XlvSummaryStrip summary={data.summary} />
          <XlvLeaderboardTable
            rows={filteredRows}
            mode="managers"
            statusFilter={statusFilter}
          />
        </div>
      ) : null}
    </PageShell>
  );
}
