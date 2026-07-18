"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { n7Path } from "@/lib/business-lines";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import {
  NotionAlert,
  NotionInput,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import {
  N7LeaderboardTable,
  N7SummaryStrip,
  type N7BoardRow,
} from "@/components/n7/N7LeaderboardTable";

interface ApiResponse {
  dateFrom: string;
  dateTo: string;
  manager: { key: string; name: string; userId: string | null };
  totals: {
    expandCount: number;
    qualifiedCount: number;
    qualifyRate: number;
    followUpCount: number;
    p0Count: number;
  };
  rows: N7BoardRow[];
}

export function N7StaffBoard({
  managerKey,
  variant = "drilldown",
}: {
  managerKey: string;
  /** home：经理端首页；drilldown：管理员从经理排行下钻 */
  variant?: "home" | "drilldown";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const search = searchParams.get("search") ?? "";
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);
  const isHome = variant === "home";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(search);

  useRestoreListScroll(pathname, !loading && !!data);

  function pushQuery(patch: {
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.dateFrom != null || patch.dateTo != null) {
      applyN7DateRangeToParams(
        params,
        patch.dateFrom ?? dateFrom,
        patch.dateTo ?? dateTo
      );
    }
    if (patch.search != null) {
      if (patch.search) params.set("search", patch.search);
      else params.delete("search");
    }
    const path = isHome
      ? n7Path()
      : n7Path(`/managers/${encodeURIComponent(managerKey)}`);
    router.replace(`${path}?${params}`, { scroll: false });
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
    setLoading(true);
    setError("");
    const params = new URLSearchParams(rangeQs);
    if (search) params.set("search", search);
    fetch(
      `/api/n7/managers/${encodeURIComponent(managerKey)}/staff?${params}`
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
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
  }, [managerKey, rangeQs, search]);

  return (
    <PageShell>
      <PageHeader
        title={
          isHome
            ? "团队看板"
            : (data?.manager.name ?? "队员排行")
        }
        kicker={isHome ? "" : "经理下钻"}
        meta={
          <p className="text-sm text-[#64748b]">
            {isHome ? (
              <>按队员看拓展、达标与待跟进；点击队员查看设备问题。</>
            ) : (
              <>
                <HistoryBackLink
                  label="← 数据看板"
                  fallbackHref={`${n7Path()}?${rangeQs}`}
                  listScrollKey={n7Path()}
                  preferHistoryBack
                  className="text-[#2563eb] hover:text-[#1d4ed8]"
                />
                <span className="mx-2 text-[#cbd5e1]">/</span>
                点击队员查看商户达标与问题
              </>
            )}
          </p>
        }
        actions={
          <N7DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(next) => pushQuery(next)}
            trailing={
              <NotionInput
                placeholder="搜索队员"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="w-full sm:w-40"
              />
            }
          />
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && <p className="text-sm text-[#94a3b8]">正在加载队员排行…</p>}
      {!loading && data && (
        <div className="space-y-4">
          <N7SummaryStrip
            totals={data.totals}
            followUpHref={`${n7Path("/follow-up")}?${rangeQs}&managerKey=${encodeURIComponent(managerKey)}`}
            p0Href={`${n7Path("/follow-up")}?${rangeQs}&managerKey=${encodeURIComponent(managerKey)}&priority=P0`}
          />
          <N7LeaderboardTable
            rows={data.rows}
            nameHeader="作业人员"
            hrefForRow={(row) =>
              `${n7Path(
                `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(row.key)}`
              )}?${rangeQs}`
            }
            hrefForMetric={(row, metric) => {
              const base = `${n7Path(
                `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(row.key)}`
              )}?${rangeQs}&tab=followUp`;
              if (metric === "followUp") return base;
              if (metric === "p0") return `${base}&priority=P0`;
              if (metric === "notSubscribed") return `${base}&behavior=notSubscribed`;
              if (metric === "notCheckedIn") return `${base}&behavior=notCheckedIn`;
              return base;
            }}
            emptyText={
              isHome
                ? "所选注册日期范围内暂无本团队设备，请联系负责人导入考核表。"
                : "该经理在所选日期范围内暂无队员数据。"
            }
          />
        </div>
      )}
    </PageShell>
  );
}
