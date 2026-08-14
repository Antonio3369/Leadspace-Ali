"use client";
import { getFetchErrorMessage } from "@/lib/fetch-json";

import { useEffect, useMemo, useState } from "react";
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
import { N7SummaryStrip } from "@/components/n7/N7LeaderboardTable";
import { N7DeviceCardList } from "@/components/n7/N7DeviceCardList";
import {
  N7_PRIORITY_FILTERS,
  N7FilterChipText,
  n7FilterChipBaseClass,
  n7PriorityButtonClass,
  n7TabButtonClass,
} from "@/components/n7/n7-filter-styles";

type Tab = "followUp" | "qualified" | "all" | "expired";
type FollowFilter = "all" | "pending" | "done";

interface DeviceRow {
  id: string;
  deviceSn: string;
  storeName: string | null;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
  effectiveUsers: number;
  isQualified: boolean;
  priority: "P0" | "P1" | "P2" | "P3" | null;
  failReason: string | null;
  daysGap: number;
  usersGap: number;
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
  merchantPhone: string | null;
  followUpDone: boolean;
  followUpNote: string | null;
}

interface ApiResponse {
  dateFrom: string;
  dateTo: string;
  staff: {
    key: string;
    name: string;
    managerName: string | null;
  };
  totals: {
    expandCount: number;
    qualifiedCount: number;
    qualifyRate: number;
    followUpCount: number;
    p0Count: number;
    expiredUnqualifiedCount: number;
  };
  priorityCounts: {
    P0: number;
    P1: number;
    P2: number;
    P3: number;
    followUp: number;
  };
  devices: DeviceRow[];
}

const TABS: { id: Tab; label: string }[] = [
  { id: "followUp", label: "待跟进" },
  { id: "qualified", label: "已达标" },
  { id: "expired", label: "过期未达标" },
  { id: "all", label: "全部" },
];

export function N7StaffDevicesView({
  managerKey,
  staffKey,
  backHref,
}: {
  managerKey: string;
  staffKey: string;
  /** 覆盖默认返回队员排行链接（经理端回团队看板） */
  backHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);
  const tab = (searchParams.get("tab") as Tab) || "followUp";
  const search = searchParams.get("q") ?? "";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(search);

  const parentListKey = backHref
    ? backHref.split("?")[0] || n7Path("/board")
    : n7Path(`/managers/${encodeURIComponent(managerKey)}`);

  useRestoreListScroll(pathname, !loading && !!data);

  const priorityFilter = searchParams.get("priority");
  const behaviorFilter = searchParams.get("behavior");
  const followFilter = (searchParams.get("follow") as FollowFilter) || "all";
  const isExpiredTab = tab === "expired";

  function pushQuery(
    patch: Partial<{
      dateFrom: string;
      dateTo: string;
      tab: Tab;
      q: string;
      priority: string | null;
      behavior: string | null;
      follow: FollowFilter;
    }>
  ) {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.dateFrom != null || patch.dateTo != null) {
      applyN7DateRangeToParams(
        params,
        patch.dateFrom ?? dateFrom,
        patch.dateTo ?? dateTo
      );
    }
    if (patch.tab != null) params.set("tab", patch.tab);
    if (patch.priority !== undefined) {
      if (patch.priority) params.set("priority", patch.priority);
      else params.delete("priority");
    }
    if (patch.behavior !== undefined) {
      if (patch.behavior) params.set("behavior", patch.behavior);
      else params.delete("behavior");
    }
    if (patch.follow != null) {
      if (patch.follow === "all") params.delete("follow");
      else params.set("follow", patch.follow);
    }
    if (patch.q != null) {
      if (patch.q) params.set("q", patch.q);
      else params.delete("q");
    }
    router.replace(
      `${n7Path(
        `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}`
      )}?${params}`,
      { scroll: false }
    );
  }

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== search) pushQuery({ q: searchDraft });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams(rangeQs);
    params.set("tab", tab);
    params.set("managerKey", managerKey);
    if (search.trim()) params.set("q", search.trim());
    fetch(`/api/n7/staff/${encodeURIComponent(staffKey)}/devices?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(getFetchErrorMessage(err, "加载失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [staffKey, managerKey, rangeQs, tab, search]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.devices;
    // 过期/已达标/全部：不吃待跟进的 priority/behavior，避免 URL 残留把列表筛空
    if (tab === "followUp") {
      if (
        priorityFilter === "P0" ||
        priorityFilter === "P1" ||
        priorityFilter === "P2" ||
        priorityFilter === "P3"
      ) {
        list = list.filter((d) => d.priority === priorityFilter);
      }
      if (behaviorFilter === "notSubscribed") {
        list = list.filter((d) => d.notSubscribed);
      } else if (behaviorFilter === "notCheckedIn") {
        list = list.filter((d) => d.notCheckedIn);
      } else if (behaviorFilter === "notLit") {
        list = list.filter((d) => d.notLit);
      }
    }
    if (
      (tab === "followUp" || tab === "expired") &&
      followFilter === "pending"
    ) {
      list = list.filter((d) => !d.followUpDone);
    } else if (
      (tab === "followUp" || tab === "expired") &&
      followFilter === "done"
    ) {
      list = list.filter((d) => d.followUpDone);
    }
    return list;
  }, [data, priorityFilter, behaviorFilter, followFilter, tab]);

  const followCounts = useMemo(() => {
    if (!data) return { pending: 0, done: 0, all: 0 };
    let pending = 0;
    let done = 0;
    for (const d of data.devices) {
      if (d.followUpDone) done += 1;
      else pending += 1;
    }
    return { pending, done, all: data.devices.length };
  }, [data]);

  const emptyText =
    tab === "expired"
      ? "暂无过期未达标设备"
      : tab === "qualified"
        ? "暂无已达标设备"
        : tab === "followUp"
          ? "暂无待跟进设备"
          : "暂无设备";

  return (
    <PageShell>
      <PageHeader
        title={data?.staff.name ?? "队员明细"}
        titleClassName={isExpiredTab ? "!text-[#c41e3a]" : undefined}
        kicker={
          data?.staff.managerName
            ? `${data.staff.managerName} · 队员`
            : "队员明细"
        }
        meta={
          <p className="text-sm text-[#64748b]">
            <HistoryBackLink
              label={backHref ? "← 团队看板" : "← 队员排行"}
              fallbackHref={
                backHref
                  ? `${backHref}${backHref.includes("?") ? "&" : "?"}${rangeQs}`
                  : `${n7Path(`/managers/${encodeURIComponent(managerKey)}`)}?${rangeQs}`
              }
              listScrollKey={parentListKey}
              preferHistoryBack
              className="text-[#2563eb] hover:text-[#1d4ed8]"
            />
            {!loading && data ? (
              <>
                <span className="mx-2 text-[#cbd5e1]">/</span>
                {`当前 ${filtered.length} 条`}
              </>
            ) : null}
          </p>
        }
        actions={
          <N7DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(next) => pushQuery(next)}
            trailing={
              <NotionInput
                placeholder="门店 / SN / 手机"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="w-full sm:w-44"
              />
            }
          />
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && <p className="text-sm text-[#94a3b8]">正在加载设备列表…</p>}
      {!loading && data && (
        <div className="space-y-4">
          <N7SummaryStrip
            totals={data.totals}
            followUpHref={`${n7Path(
              `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}`
            )}?${rangeQs}&tab=followUp`}
            p0Href={`${n7Path(
              `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}`
            )}?${rangeQs}&tab=followUp&priority=P0`}
            expiredHref={`${n7Path(
              `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}`
            )}?${rangeQs}&tab=expired`}
          />

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {TABS.map((item) => {
                const active =
                  tab === item.id && !priorityFilter && !behaviorFilter;
                const count =
                  item.id === "followUp"
                    ? data.priorityCounts.followUp
                    : item.id === "qualified"
                      ? data.totals.qualifiedCount
                      : item.id === "expired"
                        ? data.totals.expiredUnqualifiedCount
                        : data.totals.expandCount;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      pushQuery({
                        tab: item.id,
                        priority: null,
                        behavior: null,
                      })
                    }
                    className={`${n7FilterChipBaseClass()} w-full justify-center ${n7TabButtonClass(active)}`}
                  >
                    <N7FilterChipText
                      label={item.label}
                      count={count}
                      active={active}
                    />
                  </button>
                );
              })}
            </div>
            {tab === "followUp" ? (
              <div className="space-y-1.5">
                <span className="text-xs text-[#94a3b8]">按紧急度</span>
                <div className="grid grid-cols-2 gap-2">
                  {N7_PRIORITY_FILTERS.map((item) => {
                    const active =
                      priorityFilter === item.id && !behaviorFilter;
                    const count = data.priorityCounts[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={item.hint}
                        onClick={() =>
                          pushQuery({
                            tab: "followUp",
                            priority: active ? null : item.id,
                            behavior: null,
                          })
                        }
                        className={`${n7FilterChipBaseClass()} w-full justify-center ${n7PriorityButtonClass(item.id, active)}`}
                      >
                        <N7FilterChipText
                          label={item.label}
                          count={count}
                          active={active}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {tab === "followUp" || tab === "expired" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#94a3b8] mr-0.5 w-full sm:w-auto">
                {isExpiredTab ? "知悉状态" : "处理状态"}
              </span>
              {(
                [
                  { id: "all" as const, label: "全部", count: followCounts.all },
                  {
                    id: "pending" as const,
                    label: isExpiredTab ? "未标记" : "未处理",
                    count: followCounts.pending,
                  },
                  {
                    id: "done" as const,
                    label: isExpiredTab ? "已知悉" : "已处理",
                    count: followCounts.done,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pushQuery({ follow: item.id })}
                  className={`${n7FilterChipBaseClass()} ${n7TabButtonClass(followFilter === item.id)}`}
                >
                  <N7FilterChipText
                    label={item.label}
                    count={item.count}
                    active={followFilter === item.id}
                  />
                </button>
              ))}
            </div>
            ) : null}
            {behaviorFilter && (
              <p className="text-xs text-[#64748b]">
                当前筛选：
                {behaviorFilter === "notSubscribed"
                  ? "待跟进中 · 未订阅"
                  : behaviorFilter === "notCheckedIn"
                    ? "待跟进中 · 未打卡"
                    : "待跟进中 · 未点亮"}
                <button
                  type="button"
                  className="ml-2 text-[#2563eb] hover:underline"
                  onClick={() => pushQuery({ behavior: null })}
                >
                  清除
                </button>
              </p>
            )}
          </div>

          <N7DeviceCardList
            devices={filtered}
            showManager={false}
            showOperator={false}
            rangeQs={rangeQs}
            variant={isExpiredTab ? "expired" : "followUp"}
            emptyText={emptyText}
            showBehavior
            onFollowUpChanged={(deviceSn, next) => {
              setData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  devices: prev.devices.map((row) =>
                    row.deviceSn === deviceSn
                      ? {
                          ...row,
                          followUpDone: next.followUpDone,
                          followUpNote: next.followUpNote,
                        }
                      : row
                  ),
                };
              });
            }}
          />
        </div>
      )}
    </PageShell>
  );
}
