"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import {
  N7_PRIORITY_FILTERS,
  n7FilterChipBaseClass,
  n7PriorityButtonClass,
  n7TabButtonClass,
} from "@/components/n7/n7-filter-styles";
import { N7PriorityBadge } from "@/components/n7/N7PriorityBadge";
import { N7FollowUpStatusCell } from "@/components/n7/N7FollowUpStatusCell";

type Tab = "followUp" | "qualified" | "all";
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
    fetch(`/api/n7/staff/${encodeURIComponent(staffKey)}/devices?${params}`)
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
  }, [staffKey, managerKey, rangeQs, tab]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.devices;
    if (priorityFilter === "P0" || priorityFilter === "P1" || priorityFilter === "P2" || priorityFilter === "P3") {
      list = list.filter((d) => d.priority === priorityFilter);
    }
    if (behaviorFilter === "notSubscribed") {
      list = list.filter((d) => d.notSubscribed);
    } else if (behaviorFilter === "notCheckedIn") {
      list = list.filter((d) => d.notCheckedIn);
    } else if (behaviorFilter === "notLit") {
      list = list.filter((d) => d.notLit);
    }
    if (followFilter === "pending") {
      list = list.filter((d) => !d.followUpDone);
    } else if (followFilter === "done") {
      list = list.filter((d) => d.followUpDone);
    }
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (d) =>
        d.deviceSn.toLowerCase().includes(q) ||
        (d.storeName ?? "").toLowerCase().includes(q) ||
        (d.merchantPhone ?? "").includes(q)
    );
  }, [data, search, priorityFilter, behaviorFilter, followFilter]);

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

  return (
    <PageShell>
      <PageHeader
        title={data?.staff.name ?? "队员明细"}
        kicker={data?.staff.managerName ? `${data.staff.managerName} · 队员` : "队员明细"}
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
          />

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {TABS.map((item) => {
                const active = tab === item.id && !priorityFilter && !behaviorFilter;
                const count =
                  item.id === "followUp"
                    ? data.priorityCounts.followUp
                    : item.id === "qualified"
                      ? data.totals.qualifiedCount
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
                    className={`${n7FilterChipBaseClass()} ${n7TabButtonClass(active)}`}
                  >
                    {item.label} {count}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#94a3b8] mr-0.5 w-full sm:w-auto">按紧急度</span>
              {N7_PRIORITY_FILTERS.map((item) => {
                const active = priorityFilter === item.id && !behaviorFilter;
                const count = data.priorityCounts[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.hint}
                    onClick={() =>
                      pushQuery({
                        tab: "followUp",
                        priority: item.id,
                        behavior: null,
                      })
                    }
                    className={`${n7FilterChipBaseClass()} ${n7PriorityButtonClass(item.id, active)}`}
                  >
                    {item.label} {count}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#94a3b8] mr-0.5 w-full sm:w-auto">处理状态</span>
              {(
                [
                  { id: "all" as const, label: "全部", count: followCounts.all },
                  { id: "pending" as const, label: "未处理", count: followCounts.pending },
                  { id: "done" as const, label: "已处理", count: followCounts.done },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pushQuery({ follow: item.id })}
                  className={`${n7FilterChipBaseClass()} ${n7TabButtonClass(followFilter === item.id)}`}
                >
                  {item.label} {item.count}
                </button>
              ))}
            </div>
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

          <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#eef2f7] text-left text-[0.72rem] uppercase tracking-wide text-[#94a3b8]">
                  <th className="px-3 py-3 font-semibold">优先级</th>
                  <th className="px-3 py-3 font-semibold">剩余天数</th>
                  <th className="px-3 py-3 font-semibold">门店</th>
                  <th className="px-3 py-3 font-semibold">处理状态</th>
                  <th className="px-3 py-3 font-semibold text-right">已用天数</th>
                  <th className="px-3 py-3 font-semibold text-right">已有用户</th>
                  <th className="px-3 py-3 font-semibold">缺口</th>
                  <th className="px-3 py-3 font-semibold">行为</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[#94a3b8]">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => (
                    <tr
                      key={d.id}
                      data-list-anchor={d.deviceSn}
                      className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc]"
                    >
                      <td className="px-3 py-2.5">
                        <N7PriorityBadge p={d.priority} />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {d.remainingEnded
                          ? "已结束"
                          : d.remainingDays == null
                            ? "—"
                            : d.remainingDays}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={n7Path(`/devices/${encodeURIComponent(d.deviceSn)}`)}
                          className="font-medium text-[#2563eb] hover:text-[#1d4ed8]"
                        >
                          {d.storeName || "未命名门店"}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <N7FollowUpStatusCell
                          deviceSn={d.deviceSn}
                          done={Boolean(d.followUpDone)}
                          note={d.followUpNote}
                          onChanged={(next) => {
                            setData((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                devices: prev.devices.map((row) =>
                                  row.deviceSn === d.deviceSn
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
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.effectiveDays}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.effectiveUsers}</td>
                      <td className="px-3 py-2.5 text-[#64748b]">
                        {d.isQualified
                          ? "已达标"
                          : `差${d.daysGap}天·差${d.usersGap}人`}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {d.notLit && (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[0.7rem] text-red-700">
                              未点亮
                            </span>
                          )}
                          {d.notSubscribed && (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[0.7rem] text-red-700">
                              未订阅
                            </span>
                          )}
                          {d.notCheckedIn && (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[0.7rem] text-red-700">
                              未打卡
                            </span>
                          )}
                          {!d.notLit && !d.notSubscribed && !d.notCheckedIn && (
                            <span className="text-[#cbd5e1]">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
