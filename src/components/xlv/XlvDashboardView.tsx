"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readXlvApiCache } from "@/lib/xlv-api-cache";
import { fetchXlvJson } from "@/lib/xlv-fetch";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import {
  parseXlvAlertKind,
  parseXlvQualificationStatus,
  XLV_INVENTORY_MANAGER_LABEL,
  XLV_QUALIFICATION_LABELS,
  type XlvAlertKind,
  type XlvDeviceAlertKind,
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

interface QualSummaryResponse {
  active: number;
  qualifiedCount: number;
  inProgressCount: number;
  invalidCount: number;
}

function buildListQuery(
  alert: XlvAlertKind,
  status: XlvQualificationStatus | null,
  manager: string,
  operator: string,
  search: string,
  offset: number
) {
  const params = new URLSearchParams();
  if (alert !== "all") params.set("alert", alert);
  if (status && alert === "all") params.set("status", status);
  if (manager) params.set("manager", manager);
  if (operator) params.set("operator", operator);
  if (search) params.set("q", search);
  if (offset > 0) params.set("offset", String(offset));
  return params;
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
  const isAlertsHome = pathname.endsWith("/alerts");
  const hasQuery = searchParams.toString().length > 0;
  const alert = parseXlvAlertKind(
    searchParams.get("alert") ?? (isAlertsHome && !hasQuery ? "sleep" : null)
  );
  const rawStatus = parseXlvQualificationStatus(searchParams.get("status"));
  const status = alert !== "all" ? null : rawStatus;
  const manager = searchParams.get("manager") ?? "";
  const operator = searchParams.get("operator") ?? "";
  const search = searchParams.get("q") ?? "";

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
  const [qualLoaded, setQualLoaded] = useState(false);
  const [loadedFilterKey, setLoadedFilterKey] = useState("");
  const [error, setError] = useState("");
  const [retryLabel, setRetryLabel] = useState("");
  const [searchDraft, setSearchDraft] = useState(search);

  useRestoreListScroll(pathname, active && !loading && devices.length > 0);

  const filterKey = `${alert}|${status}|${manager}|${operator}|${search}`;

  const pushQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
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
          setSummary((prev) => ({
            ...summaryJson.summary,
            active: prev?.active ?? summaryJson.summary.active,
            qualifiedCount: prev?.qualifiedCount ?? summaryJson.summary.qualifiedCount,
            inProgressCount:
              prev?.inProgressCount ?? summaryJson.summary.inProgressCount,
            invalidCount: prev?.invalidCount ?? summaryJson.summary.invalidCount,
          }));
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
    const listParams = buildListQuery(alert, status, manager, operator, search, 0);
    const devicesUrl = `/api/xlv/dashboard/devices?${listParams.toString()}`;

    if (loadedFilterKey === filterKey) {
      return;
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
      onRetry: (attempt) => {
        if (!cancelled && !hasCached) {
          setRetryLabel(`服务重启中，正在重试（${attempt}/8）…`);
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
        if (!cancelled && !hasCached) {
          setError(err instanceof Error ? err.message : "加载失败");
          setRetryLabel("");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, alert, status, manager, operator, search, filterKey, loadedFilterKey]);

  useEffect(() => {
    if (!active || qualLoaded) return;
    let cancelled = false;
    void fetchXlvJson<QualSummaryResponse>("/api/xlv/dashboard/qual-summary", {
      context: "加载考核统计",
    })
      .then((qual) => {
        if (!cancelled) {
          setSummary((prev) =>
            prev
              ? { ...prev, ...qual }
              : {
                  totalDevices: 0,
                  deployedCount: 0,
                  inventoryCount: 0,
                  singleSilence: 0,
                  dormant: 0,
                  latestStatDate: null,
                  ...qual,
                }
          );
          setQualLoaded(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, qualLoaded]);

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
      devices.length
    );
    const url = `/api/xlv/dashboard/devices?${listParams.toString()}`;
    try {
      const json = await fetchXlvJson<DevicesResponse>(url, {
        context: "加载更多商户",
        useCache: false,
      });
      setDevices((prev) => [...prev, ...json.devices]);
      setMatchedCount(json.matchedCount);
      setHasMore(json.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  }, [
    alert,
    status,
    manager,
    operator,
    search,
    devices.length,
    hasMore,
    loadingMore,
  ]);

  const showManager = role !== "SALES";
  const hasDrill = Boolean(
    manager || operator || alert !== "all" || status || search
  );

  const alertShortcuts = summary
    ? [
        {
          id: "single_silence" as const,
          label: "单笔沉默",
          value: summary.singleSilence,
          hint: "仅 1 笔后未再用",
          tone: "danger" as const,
        },
        {
          id: "dormant" as const,
          label: "沉睡",
          value: summary.dormant,
          hint: "≥2 天无收款",
          tone: "amber" as const,
        },
      ]
    : [];

  const qualShortcuts = summary
    ? [
        {
          id: "in_progress" as const,
          label: XLV_QUALIFICATION_LABELS.in_progress,
          value: qualLoaded ? summary.inProgressCount : null,
          hint: "两月窗口考核中",
          tone: "sky" as const,
        },
        {
          id: "qualified" as const,
          label: XLV_QUALIFICATION_LABELS.qualified,
          value: qualLoaded ? summary.qualifiedCount : null,
          hint: "自然月达标",
          tone: "green" as const,
        },
        {
          id: "invalid" as const,
          label: XLV_QUALIFICATION_LABELS.invalid,
          value: qualLoaded ? summary.invalidCount : null,
          hint: "两月未达标",
          tone: "muted" as const,
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

  function selectShortcutFilter(
    id: XlvDeviceAlertKind | XlvQualificationStatus
  ) {
    const isAlert = id === "single_silence" || id === "dormant";
    if (isAlert) {
      pushQuery({
        alert: alert === id ? null : id,
        status: null,
      });
      return;
    }
    pushQuery({
      status: status === id ? null : id,
      alert: null,
    });
  }

  const activeShortcut = status ?? (alert !== "all" ? alert : null);

  const listTitle =
    status === "qualified"
      ? "已达标商户"
      : status === "in_progress"
        ? "考核中商户"
      : status === "invalid"
        ? "无效用户商户"
        : alert === "sleep"
          ? "沉睡商户"
          : alert === "single_silence"
            ? "单笔沉默商户"
            : alert === "dormant"
              ? "沉睡商户"
              : manager === XLV_INVENTORY_MANAGER_LABEL
                ? "剩余库存"
                : "全部商户";

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
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
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

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {retryLabel ? <NotionAlert tone="info">{retryLabel}</NotionAlert> : null}

      {!loading && summary && summary.totalDevices === 0 ? (
        <NotionCallout>
          暂无设备数据。请先在「数据导入」上传运营原始表，再导入人员归属表补齐队员与经理。
        </NotionCallout>
      ) : null}

      {summary && summary.totalDevices > 0 ? (
        <>
          <div className="space-y-4">
            <section className="space-y-2">
              <h2 className="text-xs font-medium text-[#94a3b8] px-0.5">沉睡预警</h2>
              <div className="grid grid-cols-2 gap-3">
                {alertShortcuts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectShortcutFilter(item.id)}
                    className={`rounded-[14px] border px-4 py-3 text-left transition-colors ${toneClass[item.tone]} ${
                      alert === item.id ? "ring-2 ring-[#2563eb]/30" : ""
                    }`}
                  >
                    <p className="text-xs text-[#64748b]">{item.hint}</p>
                    <p
                      className={`mt-1 text-2xl font-bold tabular-nums ${valueClass[item.tone]}`}
                    >
                      {item.value}
                    </p>
                    <p className="text-sm font-medium text-[#334155]">{item.label}</p>
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <h2 className="text-xs font-medium text-[#94a3b8] px-0.5">考核状态</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {qualShortcuts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectShortcutFilter(item.id)}
                    className={`rounded-[14px] border px-4 py-3 text-left transition-colors ${toneClass[item.tone]} ${
                      status === item.id ? "ring-2 ring-[#2563eb]/30" : ""
                    }`}
                  >
                    <p className="text-xs text-[#64748b]">{item.hint}</p>
                    <p
                      className={`mt-1 text-2xl font-bold tabular-nums ${valueClass[item.tone]}`}
                    >
                      {item.value == null ? "…" : item.value}
                    </p>
                    <p className="text-sm font-medium text-[#334155]">{item.label}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {(role === "DIRECTOR" || role === "MANAGER") && (
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
          )}

          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-0.5">
              <h2 className="text-sm font-semibold text-[#111827]">{listTitle}</h2>
              {!loading ? (
                <span className="text-xs text-[#94a3b8] tabular-nums">
                  已显示 {devices.length}
                  {matchedCount > devices.length ? ` / ${matchedCount}` : ""} 条
                </span>
              ) : null}
            </div>

            {loading ? (
              <p className="text-sm text-[#94a3b8] px-1 py-8 text-center">加载中…</p>
            ) : (
              <>
                <XlvDeviceCardList
                  devices={devices}
                  showManager={showManager}
                  linkToDetail
                  activeShortcut={activeShortcut}
                  emptyText={
                    hasDrill ? "当前筛选下暂无设备" : "暂无数据，请先导入运营表"
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
        </>
      ) : loading ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : null}
    </PageShell>
  );
}
