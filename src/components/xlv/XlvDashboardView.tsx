"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";
import {
  getCurrentMonthRange as getLedgerCurrentMonthRange,
  getLastMonthRange,
} from "@/lib/ledger-date";
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { fetchRetryNotice, getFetchErrorMessage, isFetchAbortedError } from "@/lib/fetch-json";
import { readXlvApiCache } from "@/lib/xlv-api-cache";
import { fetchXlvJson } from "@/lib/xlv-fetch";
import { searchParamsToQueryString } from "@/lib/search-query";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import {
  parseXlvAlertKind,
  parseXlvQualificationStatus,
  XLV_INVENTORY_MANAGER_LABEL,
  type XlvAlertKind,
  type XlvQualificationStatus,
} from "@/lib/xlv-rules";
import {
  NotionAlert,
  NotionCallout,
  NotionInput,
  NotionSelect,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import { XlvDeviceCardList } from "@/components/xlv/XlvDeviceCardList";
import type {
  XlvDashboardSummary,
  XlvDeviceListItem,
} from "@/services/xlv/analytics";

interface SummaryResponse {
  summary: XlvDashboardSummary;
  filters: { managers: string[]; operators: string[] };
}

interface DevicesResponse {
  devices: XlvDeviceListItem[];
  matchedCount: number;
  hasMore: boolean;
}

interface PulseSummaryResponse {
  dateFrom: string;
  dateTo: string;
  monthExpandCount: number;
  monthQualifiedCount: number;
  monthQualifyRate: number | null;
  singleSilence: number;
  dormant: number;
  wakeUpRate: number;
}

type PulseCardId =
  | "expand"
  | "qualify_rate"
  | "single_silence"
  | "dormant"
  | "wake_rate"
  | "qualified";

function buildListQuery(
  alert: XlvAlertKind,
  status: XlvQualificationStatus | null,
  manager: string,
  operator: string,
  search: string,
  expandMonth: boolean,
  dateFrom: string,
  dateTo: string,
  offset: number
) {
  const params = new URLSearchParams();
  if (alert !== "all") params.set("alert", alert);
  if (status && alert === "all") params.set("status", status);
  if (expandMonth) {
    params.set("expand", "month");
    applyN7DateRangeToParams(params, dateFrom, dateTo);
  }
  if (manager) params.set("manager", manager);
  if (operator) params.set("operator", operator);
  if (search) params.set("q", search);
  if (offset > 0) params.set("offset", String(offset));
  return params;
}

function xlvExpandPeriodCopy(dateFrom: string, dateTo: string) {
  const cur = getLedgerCurrentMonthRange();
  const last = getLastMonthRange();
  if (dateFrom === cur.dateFrom && dateTo === cur.dateTo) {
    return {
      expandLabel: "本月拓展",
      expandHint: "本月首笔",
      qualifiedHint: "本月首笔已达标",
      rateHint: "占本月拓展",
      listExpand: "本月拓展商户",
      listExpandQualified: "本月拓展 · 已达标",
    };
  }
  if (dateFrom === last.dateFrom && dateTo === last.dateTo) {
    return {
      expandLabel: "上月拓展",
      expandHint: "上月首笔",
      qualifiedHint: "上月首笔已达标",
      rateHint: "占上月拓展",
      listExpand: "上月拓展商户",
      listExpandQualified: "上月拓展 · 已达标",
    };
  }
  return {
    expandLabel: "期间拓展",
    expandHint: `${dateFrom.slice(0, 7)} 首笔`,
    qualifiedHint: `${dateFrom.slice(0, 7)} 首笔已达标`,
    rateHint: "占期间拓展",
    listExpand: "期间拓展商户",
    listExpandQualified: "期间拓展 · 已达标",
  };
}

function qualifyRateClass(rate: number) {
  if (rate >= 75) return "text-emerald-800";
  if (rate >= 60) return "text-amber-800";
  return "text-[#b91c1c]";
}

export function XlvDashboardView({
  role,
  active = true,
}: {
  role: string;
  active?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const alert = parseXlvAlertKind(searchParams.get("alert"));
  const rawStatus = parseXlvQualificationStatus(searchParams.get("status"));
  const status = alert !== "all" ? null : rawStatus;
  const manager = searchParams.get("manager") ?? "";
  const operator = searchParams.get("operator") ?? "";
  const search = searchParams.get("q") ?? "";
  const expandParam = searchParams.get("expand");
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);
  /** 日期条写着「首笔日期」：本月/上月默认就按首笔筛列表。expand=all 才看全部。 */
  const filterByFirstTxn =
    !search.trim() && alert === "all" && expandParam !== "all";
  const expandMonth = filterByFirstTxn;
  const periodCopy = xlvExpandPeriodCopy(dateFrom, dateTo);

  const [summary, setSummary] = useState<XlvDashboardSummary | null>(null);
  const [filters, setFilters] = useState<SummaryResponse["filters"]>({
    managers: [],
    operators: [],
  });
  const [devices, setDevices] = useState<XlvDeviceListItem[]>([]);
  const [matchedCount, setMatchedCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pulse, setPulse] = useState<PulseSummaryResponse | null>(null);
  const [pulseLoaded, setPulseLoaded] = useState(false);
  const [loadedFilterKey, setLoadedFilterKey] = useState("");
  const [error, setError] = useState("");
  const [retryLabel, setRetryLabel] = useState("");
  const [searchDraft, setSearchDraft] = useState(search);

  const filterKey = `${alert}|${status}|${expandMonth}|${manager}|${operator}|${search}|${expandMonth ? rangeQs : ""}`;
  const listLoading = loading && loadedFilterKey !== filterKey;

  useRestoreListScroll(pathname, active && !listLoading && devices.length > 0);

  const pushQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`${pathname}?${searchParamsToQueryString(params)}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const applyDateRange = useCallback(
    (next: { dateFrom: string; dateTo: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      applyN7DateRangeToParams(params, next.dateFrom, next.dateTo);
      if (alert === "all") params.set("expand", "month");
      router.replace(`${pathname}?${searchParamsToQueryString(params)}`, {
        scroll: false,
      });
    },
    [alert, pathname, router, searchParams]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== search) pushQuery({ q: searchDraft || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, search, pushQuery]);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const summaryUrl = "/api/xlv/dashboard/summary";
    const cachedSummary = readXlvApiCache<SummaryResponse>(summaryUrl);

    if (cachedSummary) {
      setSummary(cachedSummary.summary);
    }

    void fetchXlvJson<SummaryResponse>(summaryUrl, {
      context: "加载看板统计",
    })
      .then((summaryJson) => {
        if (!cancelled) {
          setSummary(summaryJson.summary);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [active]);

  /** 队员下拉随所选经理收窄（负责人选经理后只看该团队） */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (manager) params.set("manager", manager);
    const url = `/api/xlv/dashboard/summary?${params}`;
    void fetchXlvJson<SummaryResponse>(url, { context: "加载筛选" })
      .then((json) => {
        if (!cancelled) setFilters(json.filters);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, manager]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const listParams = buildListQuery(
      alert,
      status,
      manager,
      operator,
      search,
      expandMonth,
      dateFrom,
      dateTo,
      0
    );
    const devicesUrl = `/api/xlv/dashboard/devices?${searchParamsToQueryString(listParams)}`;

    if (loadedFilterKey === filterKey) {
      return () => {
        cancelled = true;
      };
    }

    const cachedDevices = readXlvApiCache<DevicesResponse>(devicesUrl);
    const hasCached = Boolean(cachedDevices);

    if (hasCached) {
      setDevices(cachedDevices!.devices);
      setMatchedCount(cachedDevices!.matchedCount);
      setHasMore(cachedDevices!.hasMore);
      setLoading(false);
      setLoadedFilterKey(filterKey);
    } else {
      setLoading(true);
      setError("");
      setRetryLabel("");
      setDevices([]);
      setMatchedCount(0);
      setHasMore(false);
    }

    fetchXlvJson<DevicesResponse>(devicesUrl, {
      context: "加载商户列表",
      onRetry: (attempt, reason) => {
        if (!cancelled && !hasCached) {
          setRetryLabel(fetchRetryNotice(attempt, reason));
        }
      },
    })
      .then((devicesJson) => {
        if (!cancelled) {
          setDevices(devicesJson.devices);
          setMatchedCount(devicesJson.matchedCount);
          setHasMore(devicesJson.hasMore);
          setRetryLabel("");
          setLoading(false);
          setLoadedFilterKey(filterKey);
        }
      })
      .catch((err) => {
        if (cancelled || isFetchAbortedError(err)) return;
        if (!hasCached) {
          setError(getFetchErrorMessage(err, "加载失败"));
          setRetryLabel("");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, alert, status, expandMonth, dateFrom, dateTo, manager, operator, search, filterKey, loadedFilterKey]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setPulseLoaded(false);
    void fetchXlvJson<PulseSummaryResponse>(
      `/api/xlv/dashboard/pulse?${rangeQs}`,
      {
        context: "加载指标",
      }
    )
      .then((json) => {
        if (!cancelled) {
          setPulse(json);
          setPulseLoaded(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, rangeQs]);

  useEffect(() => {
    if (!filters.operators.length || !operator) return;
    if (!filters.operators.includes(operator)) {
      pushQuery({ operator: null });
    }
  }, [filters.operators, operator, pushQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const listParams = buildListQuery(
      alert,
      status,
      manager,
      operator,
      search,
      expandMonth,
      dateFrom,
      dateTo,
      devices.length
    );
    const url = `/api/xlv/dashboard/devices?${searchParamsToQueryString(listParams)}`;
    try {
      const json = await fetchXlvJson<DevicesResponse>(url, {
        context: "加载更多商户",
        useCache: false,
      });
      setDevices((prev) => [...prev, ...json.devices]);
      setMatchedCount(json.matchedCount);
      setHasMore(json.hasMore);
    } catch (err) {
      setError(getFetchErrorMessage(err, "加载更多失败"));
    } finally {
      setLoadingMore(false);
    }
  }, [
    alert,
    status,
    expandMonth,
    dateFrom,
    dateTo,
    manager,
    operator,
    search,
    devices.length,
    hasMore,
    loadingMore,
  ]);

  const showManager = role !== "SALES";
  const hasDrill = Boolean(
    manager || operator || alert !== "all" || status || expandMonth || search
  );

  const monthQualifiedActive = expandMonth && status === "qualified";
  const monthExpandActive = expandMonth && status !== "qualified";

  function isPulseCardActive(id: PulseCardId) {
    if (id === "qualified" || id === "qualify_rate") return monthQualifiedActive;
    if (id === "expand") return monthExpandActive;
    if (id === "single_silence") return alert === "single_silence";
    if (id === "dormant") return alert === "dormant" || alert === "sleep";
    return false;
  }

  const pulseCards = pulse
    ? [
        {
          id: "expand" as const,
          label: periodCopy.expandLabel,
          hint: periodCopy.expandHint,
          value: pulseLoaded ? pulse.monthExpandCount : null,
          tone: "sky" as const,
        },
        {
          id: "qualified" as const,
          label: "已达标",
          hint: periodCopy.qualifiedHint,
          value: pulseLoaded ? pulse.monthQualifiedCount : null,
          tone: "green" as const,
        },
        {
          id: "qualify_rate" as const,
          label: "达标率",
          hint: periodCopy.rateHint,
          value: pulseLoaded
            ? pulse.monthQualifyRate == null
              ? "—"
              : `${pulse.monthQualifyRate}%`
            : null,
          tone: "green" as const,
          valueClass: pulseLoaded
            ? pulse.monthQualifyRate == null
              ? "text-[#94a3b8]"
              : qualifyRateClass(pulse.monthQualifyRate)
            : undefined,
        },
        {
          id: "single_silence" as const,
          label: "单笔沉默",
          hint: "只用 1 笔",
          value: pulse.singleSilence,
          tone: "danger" as const,
        },
        {
          id: "dormant" as const,
          label: "沉睡",
          hint: "≥2 天无收款",
          value: pulse.dormant,
          tone: "amber" as const,
        },
        {
          id: "wake_rate" as const,
          label: "唤醒率",
          hint: "回访后恢复",
          value: pulseLoaded ? `${pulse.wakeUpRate}%` : null,
          tone: "sky" as const,
        },
      ]
    : [];

  const toneClass = {
    danger: "border-red-100 bg-red-50/80 hover:bg-red-50",
    amber: "border-amber-100 bg-amber-50/70 hover:bg-amber-50",
    green: "border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50",
    sky: "border-sky-100 bg-sky-50/60 hover:bg-sky-50",
    muted: "border-slate-100 bg-slate-50/80 hover:bg-slate-50",
  };

  const valueClass = {
    danger: "text-[#b91c1c]",
    amber: "text-amber-800",
    green: "text-emerald-800",
    sky: "text-sky-800",
    muted: "text-slate-600",
  };

  function selectPulseCard(id: PulseCardId) {
    if (id === "wake_rate") {
      router.push(xlvPath(`/daily?${rangeQs}`));
      return;
    }

    const isActive = isPulseCardActive(id);

    if (id === "expand") {
      pushQuery({
        expand: isActive ? "all" : "month",
        status: null,
        alert: null,
      });
      return;
    }
    if (id === "qualify_rate" || id === "qualified") {
      pushQuery({
        expand: isActive ? "all" : "month",
        status: isActive ? null : "qualified",
        alert: null,
      });
      return;
    }
    if (id === "single_silence") {
      pushQuery({
        alert: isActive ? null : "single_silence",
        status: null,
        expand: null,
      });
      return;
    }
    if (id === "dormant") {
      pushQuery({
        alert: isActive ? null : "dormant",
        status: null,
        expand: null,
      });
    }
  }

  const activeShortcut = status ?? (alert !== "all" ? alert : null);

  const listTitle =
    search.trim()
      ? "搜索结果"
      : expandMonth && status === "qualified"
      ? periodCopy.listExpandQualified
      : expandMonth
        ? periodCopy.listExpand
        : alert === "single_silence"
            ? "单笔沉默商户"
            : alert === "dormant" || alert === "sleep"
              ? "沉睡商户"
              : manager === XLV_INVENTORY_MANAGER_LABEL
                ? "剩余库存"
                : "全部商户";

  const showPulseGrid = Boolean(summary && summary.totalDevices > 0);
  const showFilters =
    showPulseGrid && (role === "DIRECTOR" || role === "MANAGER");
  const showEmptyImportHint =
    !listLoading && summary && summary.totalDevices === 0 && devices.length === 0;

  return (
    <PageShell>
      <PageHeader
        title="所有设备"
        kicker="微信小绿盒"
        meta={
          <div className="space-y-1 text-sm text-[#64748b]">
            {summary?.latestStatDate ? (
              <p>
                数据截至 {summary.latestStatDate} · 共 {summary.totalDevices} 台
                {summary.inventoryCount > 0 ? (
                  <span className="text-[#94a3b8]">
                    {" "}
                    （含剩余库存 {summary.inventoryCount}）
                  </span>
                ) : null}
              </p>
            ) : (
              <p>导入运营原始表后展示沉睡与单笔沉默商户。</p>
            )}
          </div>
        }
        actions={
          <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            <div className="hidden md:block">
              <N7DateRangePicker
                compact
                dateFrom={dateFrom}
                dateTo={dateTo}
                dateLabel="首笔日期"
                onChange={applyDateRange}
              />
            </div>
            <NotionInput
              placeholder="搜索 商户名/SN/队员"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="w-full sm:w-52"
              aria-label="搜索商户、设备或队员"
            />
          </div>
        }
      />

      <div className="md:hidden sticky top-0 z-10 -mx-4 px-4 py-3 bg-[#f4f6f9]/95 backdrop-blur-sm border-b border-[#eef2f7]">
        <N7DateRangePicker
          compact
          dateFrom={dateFrom}
          dateTo={dateTo}
          dateLabel="首笔日期"
          onChange={applyDateRange}
        />
      </div>

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {retryLabel ? <NotionAlert tone="info">{retryLabel}</NotionAlert> : null}

      {showEmptyImportHint ? (
        <NotionCallout>
          暂无设备数据。请先在「数据导入」上传运营原始表，再导入人员归属表补齐队员与经理。
        </NotionCallout>
      ) : null}

      {showPulseGrid ? (
        <div className="grid grid-cols-3 gap-3">
          {pulseCards.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectPulseCard(item.id)}
              className={`rounded-[14px] border px-3 py-3 text-left transition-colors ${toneClass[item.tone]} ${
                isPulseCardActive(item.id) ? "ring-2 ring-[#2563eb]/30" : ""
              }`}
            >
              <p className="text-xs text-[#64748b]">{item.hint}</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  item.valueClass ?? valueClass[item.tone]
                }`}
              >
                {item.value == null ? "…" : item.value}
              </p>
              <p className="text-sm font-medium text-[#334155]">{item.label}</p>
            </button>
          ))}
        </div>
      ) : null}

      {showFilters ? (
        <div className="flex flex-col sm:flex-row gap-2">
          {role === "DIRECTOR" ? (
            <NotionSelect
              value={manager}
              onChange={(e) => {
                const next = e.target.value || null;
                pushQuery({
                  manager: next,
                  operator: null,
                });
              }}
              className="w-full sm:max-w-[200px]"
              aria-label="筛选经理"
            >
              <option value="">全部经理</option>
              {filters.managers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </NotionSelect>
          ) : null}
          <NotionSelect
            value={operator}
            onChange={(e) => pushQuery({ operator: e.target.value || null })}
            className="w-full sm:max-w-[200px]"
            aria-label={manager ? `${manager} 团队队员` : "筛选队员"}
          >
            <option value="">全部队员</option>
            {filters.operators.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NotionSelect>
        </div>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <h2 className="text-sm font-semibold text-[#111827]">{listTitle}</h2>
          {!listLoading ? (
            <span className="text-xs text-[#94a3b8] tabular-nums">
              已显示 {devices.length}
              {matchedCount > devices.length ? ` / ${matchedCount}` : ""} 条
            </span>
          ) : null}
        </div>

        {listLoading ? (
          <p className="text-sm text-[#94a3b8] px-1 py-8 text-center">加载中…</p>
        ) : (
          <>
            <XlvDeviceCardList
              devices={devices}
              showManager={showManager}
              linkToDetail
              activeShortcut={activeShortcut}
              emptyText={
                search.trim()
                  ? "未找到匹配设备（已在全部设备中搜索，含库存）"
                  : hasDrill
                    ? "当前筛选下暂无设备"
                    : "暂无数据，请先导入运营表"
              }
              onPickOperator={(name) => pushQuery({ operator: name })}
              onPickManager={(name) => pushQuery({ manager: name })}
            />
            {hasMore ? (
              <div className="pt-2 pb-1 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[#e2e8f0] bg-white px-5 py-2.5 text-sm font-medium text-[#334155] shadow-sm transition-colors hover:bg-[#f8fafc] disabled:opacity-60"
                >
                  {loadingMore
                    ? "加载中…"
                    : `加载更多（还剩 ${matchedCount - devices.length} 条）`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </PageShell>
  );
}
