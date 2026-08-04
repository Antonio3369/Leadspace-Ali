"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { n7Path } from "@/lib/business-lines";
import type { N7Priority } from "@/lib/n7-rules";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import {
  NotionAlert,
  NotionButton,
  NotionCallout,
  NotionInput,
  NotionSelect,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { n7SearchResultHint } from "@/lib/n7-search";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import {
  N7_PRIORITY_FILTERS,
  N7FilterChipText,
  n7FilterChipBaseClass,
  n7PriorityButtonClass,
  n7TabButtonClass,
} from "@/components/n7/n7-filter-styles";
import { N7DeviceCardList } from "@/components/n7/N7DeviceCardList";

type Filter = "all" | N7Priority;
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
  priority: N7Priority | null;
  failReason: string | null;
  daysGap: number;
  usersGap: number;
  hopeless?: boolean;
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
  merchantPhone: string | null;
  operatorName: string;
  managerName: string;
  salesUserId: string | null;
  managerUserId: string | null;
  followUpDone: boolean;
  followUpNote: string | null;
}

interface ApiResponse {
  dateFrom: string;
  dateTo: string;
  filter: Filter;
  manager: { key: string; name: string } | null;
  counts: {
    followUp: number;
    P0: number;
    P1: number;
    P2: number;
    P3: number;
  };
  devices: DeviceRow[];
}

function staffKeyOf(d: DeviceRow) {
  return d.salesUserId ?? `name:${d.operatorName}`;
}

export function N7FollowUpView({
  forcedManagerKey = null,
}: {
  /** 经理端强制锁定为自己的范围 */
  forcedManagerKey?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);
  const listStatus = searchParams.get("status");
  const isExpiredList = listStatus === "expired";
  const filter = (searchParams.get("priority") as Filter) || "all";
  const managerKey = forcedManagerKey ?? searchParams.get("managerKey");
  const staffKey = searchParams.get("staffKey") ?? "";
  const behaviorFilter = searchParams.get("behavior");
  const followFilter = (searchParams.get("follow") as FollowFilter) || "all";
  const search = searchParams.get("q") ?? "";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [searchDraft, setSearchDraft] = useState(search);

  useRestoreListScroll(pathname, !loading && !!data);

  function pushQuery(
    patch: Partial<{
      dateFrom: string;
      dateTo: string;
      priority: Filter;
      staffKey: string | null;
      behavior: string | null;
      follow: FollowFilter;
      status: "expired" | null;
      q: string;
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
    if (patch.priority != null) {
      if (patch.priority === "all") params.delete("priority");
      else params.set("priority", patch.priority);
      // 切紧急度时退出过期名单
      params.delete("status");
    }
    if (patch.status !== undefined) {
      if (patch.status === "expired") {
        params.set("status", "expired");
        params.delete("priority");
      } else {
        params.delete("status");
      }
    }
    if (patch.staffKey !== undefined) {
      if (patch.staffKey) params.set("staffKey", patch.staffKey);
      else params.delete("staffKey");
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
    router.replace(`${n7Path("/follow-up")}?${params}`, { scroll: false });
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
    if (isExpiredList) {
      params.set("status", "expired");
    } else if (filter !== "all") {
      params.set("priority", filter);
    }
    if (managerKey) params.set("managerKey", managerKey);
    if (search.trim()) params.set("q", search.trim());
    fetch(`/api/n7/follow-up?${params}`)
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
  }, [rangeQs, filter, managerKey, isExpiredList, search]);

  /** 当前结果里、名下仍有待跟进商户的队员 */
  const staffOptions = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { key: string; name: string; count: number }>();
    for (const d of data.devices) {
      const key = staffKeyOf(d);
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { key, name: d.operatorName, count: 1 });
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh")
    );
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.devices;
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
    if (staffKey) {
      list = list.filter((d) => staffKeyOf(d) === staffKey);
    }
    return list;
  }, [data, behaviorFilter, followFilter, staffKey]);

  const followCounts = useMemo(() => {
    if (!data) return { pending: 0, done: 0 };
    let pending = 0;
    let done = 0;
    for (const d of data.devices) {
      if (d.followUpDone) done += 1;
      else pending += 1;
    }
    return { pending, done };
  }, [data]);

  // 当前选中的队员若不在名单中（例如切换了优先级），自动清空
  useEffect(() => {
    if (!staffKey || loading || !data || search.trim()) return;
    if (!staffOptions.some((s) => s.key === staffKey)) {
      pushQuery({ staffKey: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffKey, staffOptions, loading, data]);

  const isManagerHome = !!forcedManagerKey;
  const isDrillDown = !isManagerHome && !!managerKey;
  const parentListKey = managerKey
    ? n7Path(`/managers/${encodeURIComponent(managerKey)}`)
    : n7Path("/board");
  const backHref = isManagerHome
    ? `${n7Path("/board")}?${rangeQs}`
    : managerKey
      ? `${n7Path(`/managers/${encodeURIComponent(managerKey)}`)}?${rangeQs}`
      : `${n7Path("/board")}?${rangeQs}`;
  const backLabel = isExpiredList
    ? isManagerHome
      ? "← 团队看板"
      : data?.manager
        ? "← 队员排行"
        : "← 数据看板"
    : isManagerHome
      ? "← 今日待办"
      : `← ${data?.manager ? "队员排行" : "数据看板"}`;
  const backListKey = isExpiredList
    ? isManagerHome
      ? n7Path("/board")
      : parentListKey
    : isManagerHome
      ? n7Path()
      : parentListKey;

  const title = isExpiredList
    ? "过期未达标"
    : filter === "all"
      ? "待跟进"
      : (N7_PRIORITY_FILTERS.find((item) => item.id === filter)?.label ??
        "待跟进明细");

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      const params = new URLSearchParams(rangeQs);
      if (filter !== "all") params.set("priority", filter);
      if (managerKey) params.set("managerKey", managerKey);
      if (staffKey) params.set("staffKey", staffKey);
      if (behaviorFilter) params.set("behavior", behaviorFilter);

      const res = await fetch(`/api/n7/follow-up/export?${params}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "导出失败");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match
        ? decodeURIComponent(match[1]!)
        : "N7待跟进.xlsx";

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

  return (
    <PageShell>
      <PageHeader
        title={title}
        titleClassName={isExpiredList ? "!text-[#c41e3a]" : undefined}
        kicker={
          isManagerHome
            ? "本团队"
            : isDrillDown
              ? data?.manager
                ? `${data.manager.name} · 下钻`
                : "数据看板 · 下钻"
              : "支付宝 N7"
        }
        meta={
          isDrillDown || isManagerHome || isExpiredList || search ? (
            <p className="text-sm text-[#64748b]">
              {isDrillDown || isManagerHome || isExpiredList ? (
                <HistoryBackLink
                  label={backLabel}
                  fallbackHref={backHref}
                  listScrollKey={backListKey}
                  preferHistoryBack
                  className="text-[#2563eb] hover:text-[#1d4ed8]"
                />
              ) : null}
              {!loading && data && search ? (
                <>
                  {isDrillDown || isManagerHome || isExpiredList ? (
                    <span className="mx-2 text-[#cbd5e1]">/</span>
                  ) : null}
                  {n7SearchResultHint(filtered.length, true)}
                </>
              ) : null}
            </p>
          ) : undefined
        }
        trailing={
          isExpiredList ? undefined : (
          <NotionButton
            onClick={handleExport}
            disabled={
              exporting || loading || filtered.length === 0
            }
            className="w-full sm:w-auto shrink-0 self-stretch sm:self-start"
          >
            {exporting ? "导出中..." : "导出表格"}
          </NotionButton>
          )
        }
        actions={
          <N7DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(next) => pushQuery(next)}
            trailing={
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <NotionInput
                  placeholder="门店 / SN / 手机"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  className="w-full sm:w-44"
                  aria-label="搜索门店或设备 SN"
                />
                <NotionSelect
                  value={staffKey}
                  onChange={(e) =>
                    pushQuery({ staffKey: e.target.value || null })
                  }
                  className="w-full sm:w-56"
                  aria-label="筛选队员"
                >
                  <option value="">
                    {isExpiredList ? "全部队员" : "全部队员（有待跟进）"}
                  </option>
                  {staffOptions.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}（{s.count}）
                    </option>
                  ))}
                </NotionSelect>
              </div>
            }
          />
        }
      />

      {exportError && <NotionAlert tone="error">{exportError}</NotionAlert>}

      {!search && (
        <NotionCallout>
          <p>
            待跟进名单按<strong>考核期</strong>展示：考核未结束即出现，与注册月份无关。
            数据看板的拓展/达标仍按<strong>注册日期</strong>统计。
          </p>
        </NotionCallout>
      )}

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && (
        <p className="text-sm text-[#94a3b8]">
          {isExpiredList ? "正在加载过期未达标…" : "正在加载待跟进设备…"}
        </p>
      )}
      {!loading && data && (
        <div className="space-y-4">
          <div className="space-y-2">
            {!isExpiredList ? (
            <div className="space-y-1.5">
              <span className="text-xs text-[#94a3b8]">按紧急度</span>
              <div className="grid grid-cols-2 gap-2">
                {N7_PRIORITY_FILTERS.map((item) => {
                  const active = filter === item.id && !behaviorFilter;
                  const count = data.counts[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.hint}
                      onClick={() =>
                        pushQuery({
                          priority: active ? "all" : item.id,
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#94a3b8] mr-0.5 w-full sm:w-auto">
                {isExpiredList ? "知悉状态" : "处理状态"}
              </span>
              {(
                [
                  {
                    id: "all" as const,
                    label: "全部",
                    count: data.devices.length,
                  },
                  {
                    id: "pending" as const,
                    label: isExpiredList ? "未标记" : "未处理",
                    count: followCounts.pending,
                  },
                  {
                    id: "done" as const,
                    label: isExpiredList ? "已知悉" : "已处理",
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
            {behaviorFilter && (
              <p className="text-xs text-[#64748b]">
                当前筛选：
                {behaviorFilter === "notSubscribed"
                  ? "未订阅"
                  : behaviorFilter === "notCheckedIn"
                    ? "未打卡"
                    : "未点亮"}
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
            showManager={!managerKey}
            rangeQs={rangeQs}
            variant={isExpiredList ? "expired" : "followUp"}
            emptyText={
              isExpiredList ? "暂无过期未达标设备" : "暂无待跟进设备"
            }
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
