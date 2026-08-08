"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readXlvApiCache } from "@/lib/xlv-api-cache";
import { fetchXlvJson } from "@/lib/xlv-fetch";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import {
  parseXlvAlertKind,
  parseXlvQualificationStatus,
  XLV_ACTIVE_IN_PROGRESS_LABEL,
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

export function XlvDashboardView({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAlertsHome = pathname.endsWith("/alerts");
  const hasQuery = searchParams.toString().length > 0;
  const alert = parseXlvAlertKind(
    searchParams.get("alert") ?? (isAlertsHome && !hasQuery ? "sleep" : null)
  );
  const rawStatus = parseXlvQualificationStatus(searchParams.get("status"));
  const status =
    alert !== "all"
      ? null
      : rawStatus === "in_progress"
        ? null
        : rawStatus;
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
  const [error, setError] = useState("");
  const [retryLabel, setRetryLabel] = useState("");
  const [searchDraft, setSearchDraft] = useState(search);

  useRestoreListScroll(pathname, !loading && devices.length > 0);

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
    if (searchParams.get("status") === "in_progress") {
      pushQuery({ status: null });
    }
  }, [searchParams, pushQuery]);

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
    let cancelled = false;
    const listParams = buildListQuery(alert, status, manager, operator, search, 0);
    const summaryUrl = "/api/xlv/dashboard/summary";
    const devicesUrl = `/api/xlv/dashboard/devices?${listParams.toString()}`;

    const cachedSummary = readXlvApiCache<SummaryResponse>(summaryUrl);
    const cachedDevices = readXlvApiCache<DevicesResponse>(devicesUrl);
    const hasCached = Boolean(cachedSummary && cachedDevices);

    if (hasCached) {
      setSummary(cachedSummary!.summary);
      setFilters(cachedSummary!.filters);
      setDevices(cachedDevices!.devices);
      setMatchedCount(cachedDevices!.matchedCount);
      setHasMore(cachedDevices!.hasMore);
      setLoading(false);
    } else {
      setLoading(true);
      setError("");
      setRetryLabel("");
      setDevices([]);
      setMatchedCount(0);
      setHasMore(false);
    }

    Promise.all([
      fetchXlvJson<SummaryResponse>(summaryUrl, {
        context: "加载看板统计",
        onRetry: (attempt) => {
          if (!cancelled && !hasCached) {
            setRetryLabel(`服务重启中，正在重试（${attempt}/8）…`);
          }
        },
      }),
      fetchXlvJson<DevicesResponse>(devicesUrl, {
        context: "加载商户列表",
        onRetry: (attempt) => {
          if (!cancelled && !hasCached) {
            setRetryLabel(`服务重启中，正在重试（${attempt}/8）…`);
          }
        },
      }),
    ])
      .then(([summaryJson, devicesJson]) => {
        if (!cancelled) {
          setSummary(summaryJson.summary);
          setFilters(summaryJson.filters);
          setDevices(devicesJson.devices);
          setMatchedCount(devicesJson.matchedCount);
          setHasMore(devicesJson.hasMore);
          setRetryLabel("");
        }
      })
      .catch((err) => {
        if (!cancelled && !hasCached) {
          setError(err instanceof Error ? err.message : "加载失败");
          setRetryLabel("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [alert, status, manager, operator, search]);

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

  const shortcuts = summary
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
        {
          id: "active" as const,
          label: XLV_ACTIVE_IN_PROGRESS_LABEL,
          value: summary.active,
          hint: "未达标且近期有收款",
          tone: "green" as const,
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
    const isAlert =
      id === "single_silence" || id === "dormant" || id === "active";
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

  const qualShortcuts = summary
    ? [
        {
          id: "qualified" as const,
          label: XLV_QUALIFICATION_LABELS.qualified,
          value: summary.qualifiedCount,
          hint: "自然月达标",
          tone: "green" as const,
        },
        {
          id: "invalid" as const,
          label: XLV_QUALIFICATION_LABELS.invalid,
          value: summary.invalidCount,
          hint: "两月未达标",
          tone: "muted" as const,
        },
      ]
    : [];

  const activeShortcut = status ?? (alert !== "all" ? alert : null);

  const listTitle =
    status === "qualified"
      ? "已达标商户"
      : status === "invalid"
        ? "无效用户商户"
        : alert === "sleep"
          ? "沉睡商户"
          : alert === "single_silence"
            ? "单笔沉默商户"
            : alert === "dormant"
              ? "沉睡商户"
              : alert === "active"
                ? `${XLV_ACTIVE_IN_PROGRESS_LABEL}商户`
                : manager === XLV_INVENTORY_MANAGER_LABEL
                  ? "剩余库存"
                  : "全部商户";

  return (
    <PageShell>
      <PageHeader
        title="沉睡预警"
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
            {hasDrill ? (
              <p>
                <button
                  type="button"
                  onClick={() =>
                    pushQuery({
                      alert: null,
                      status: null,
                      manager: null,
                      operator: null,
                      q: null,
                    })
                  }
                  className="text-[#2563eb] hover:text-[#1d4ed8] font-medium"
                >
                  ← 清除筛选
                </button>
                {manager ? <span className="ml-2">经理：{manager}</span> : null}
                {operator ? <span className="ml-2">作业员：{operator}</span> : null}
              </p>
            ) : null}
          </div>
        }
        actions={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <NotionInput
              placeholder="商户 / SN / 作业员"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="w-full sm:w-52"
              aria-label="搜索商户或设备"
            />
          </div>
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {retryLabel ? <NotionAlert tone="info">{retryLabel}</NotionAlert> : null}

      {!loading && summary && summary.totalDevices === 0 ? (
        <NotionCallout>
          暂无设备数据。请先在「数据导入」上传运营原始表，再导入人员归属表补齐作业员与经理。
        </NotionCallout>
      ) : null}

      {summary && summary.totalDevices > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {shortcuts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectShortcutFilter(item.id)}
                className={`rounded-[14px] border px-4 py-3 text-left transition-colors ${toneClass[item.tone]} ${
                  alert === item.id ? "ring-2 ring-[#2563eb]/30" : ""
                }`}
              >
                <p className="text-xs text-[#64748b]">{item.hint}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass[item.tone]}`}>
                  {item.value}
                </p>
                <p className="text-sm font-medium text-[#334155]">{item.label}</p>
              </button>
            ))}
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
                <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass[item.tone]}`}>
                  {item.value}
                </p>
                <p className="text-sm font-medium text-[#334155]">{item.label}</p>
              </button>
            ))}
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
                aria-label={manager ? `${manager} 团队作业员` : "筛选作业员"}
              >
                <option value="">全部作业员</option>
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
