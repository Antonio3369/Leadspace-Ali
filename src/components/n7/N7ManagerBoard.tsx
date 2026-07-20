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
  totals: {
    managerCount: number;
    expandCount: number;
    qualifiedCount: number;
    qualifyRate: number;
    followUpCount: number;
    p0Count: number;
  };
  rows: N7BoardRow[];
}

export function N7ManagerBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const search = searchParams.get("search") ?? "";
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);

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
    router.replace(`${n7Path("/board")}?${params.toString()}`, {
      scroll: false,
    });
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
    fetch(`/api/n7/managers?${params}`)
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
  }, [rangeQs, search]);

  return (
    <PageShell>
      <PageHeader
        title="数据看板"
        kicker="支付宝 N7"
        meta={
          <p className="text-sm text-[#64748b]">
            按经理看拓展、达标与待跟进；点击经理下钻到队员。
          </p>
        }
        actions={
          <N7DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(next) => pushQuery(next)}
            trailing={
              <NotionInput
                placeholder="搜索经理"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="w-full sm:w-40"
              />
            }
          />
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && (
        <p className="text-sm text-[#94a3b8]">正在加载经理排行…</p>
      )}
      {!loading && data && (
        <div className="space-y-4">
          <N7SummaryStrip
            totals={data.totals}
            followUpHref={`${n7Path("/follow-up")}?${rangeQs}`}
            p0Href={`${n7Path("/follow-up")}?${rangeQs}&priority=P0`}
          />
          <N7LeaderboardTable
            rows={data.rows}
            nameHeader="区域经理"
            hrefForRow={(row) =>
              `${n7Path(`/managers/${encodeURIComponent(row.key)}`)}?${rangeQs}`
            }
            hrefForMetric={(row, metric) => {
              const base = `${n7Path(`/managers/${encodeURIComponent(row.key)}`)}?${rangeQs}`;
              // 经理排行下钻到队员页后，再靠汇总卡/列继续下钻；此处先进入该经理团队
              if (metric === "followUp") {
                return `${n7Path("/follow-up")}?${rangeQs}&managerKey=${encodeURIComponent(row.key)}`;
              }
              if (metric === "p0") {
                return `${n7Path("/follow-up")}?${rangeQs}&managerKey=${encodeURIComponent(row.key)}&priority=P0`;
              }
              if (metric === "notSubscribed") {
                return `${n7Path("/follow-up")}?${rangeQs}&managerKey=${encodeURIComponent(row.key)}&behavior=notSubscribed`;
              }
              if (metric === "notCheckedIn") {
                return `${n7Path("/follow-up")}?${rangeQs}&managerKey=${encodeURIComponent(row.key)}&behavior=notCheckedIn`;
              }
              return base;
            }}
            emptyText="所选日期范围内暂无 N7 数据。请先在「数据导入」上传考核表。"
          />
        </div>
      )}
    </PageShell>
  );
}
