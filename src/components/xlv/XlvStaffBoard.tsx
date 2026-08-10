"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readXlvApiCache } from "@/lib/xlv-api-cache";
import { fetchXlvJson } from "@/lib/xlv-fetch";
import { xlvPath } from "@/lib/business-lines";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import {
  NotionAlert,
  NotionCallout,
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
  manager: { key: string; name: string; userId: string | null };
  rows: XlvBoardRow[];
  summary: {
    staffCount: number;
    deviceCount: number;
    deployedCount: number;
    inventoryCount: number;
    qualifiedCount: number;
    inProgressCount?: number;
    invalidCount?: number;
    qualifyRate: number;
  };
}

export function XlvStaffBoard({
  managerKey,
  variant = "drilldown",
}: {
  managerKey: string;
  variant?: "home" | "drilldown";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusFilter = parseXlvQualificationStatus(searchParams.get("status"));
  const isHome = variant === "home";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useRestoreListScroll(pathname, !loading && !!data);

  function pushQuery(patch: { status?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.status !== undefined) {
      if (patch.status) params.set("status", patch.status);
      else params.delete("status");
    }
    const path = isHome
      ? xlvPath("/board")
      : xlvPath(`/managers/${encodeURIComponent(managerKey)}`);
    router.replace(`${path}?${params}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    const url = `/api/xlv/managers/${encodeURIComponent(managerKey)}/staff`;

    const cached = readXlvApiCache<ApiResponse>(url);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError("");
    } else {
      setLoading(true);
      setError("");
    }

    const delayMs = cached ? 0 : 200;
    const startTimer = window.setTimeout(() => {
      fetchXlvJson<ApiResponse>(url, {
        context: "加载队员",
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
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [managerKey]);

  const filteredRows =
    data?.rows.filter((r) => {
      if (statusFilter === "qualified") return r.qualifiedCount > 0;
      if (statusFilter === "in_progress") return r.inProgressCount > 0;
      if (statusFilter === "invalid") return r.invalidCount > 0;
      return true;
    }) ?? [];

  return (
    <PageShell>
      <PageHeader
        title={isHome ? "团队看板" : `${data?.manager.name ?? "经理"} · 队员排行`}
        kicker="微信小绿盒"
        meta={
          <div className="space-y-1 text-sm text-[#64748b]">
            <p>按队员看沉睡预警；点击队员姓名查看当月拓展/达标/回访/唤醒。</p>
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
            {!isHome ? (
              <HistoryBackLink
                label="← 返回经理排行"
                fallbackHref={xlvPath("/board")}
                preferHistoryBack
                className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
              />
            ) : null}
          </div>
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}

      {!loading && data && data.summary.deviceCount === 0 ? (
        <NotionCallout>该团队暂无设备数据。</NotionCallout>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : data ? (
        <div className="space-y-4">
          <XlvSummaryStrip summary={data.summary} />
          <XlvLeaderboardTable
            rows={filteredRows}
            mode="staff"
            managerKey={managerKey}
            statusFilter={statusFilter}
          />
        </div>
      ) : null}
    </PageShell>
  );
}
