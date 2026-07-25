"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { n7Path } from "@/lib/business-lines";
import { N7_NOTIFICATIONS_CHANGED } from "@/lib/n7-notifications-client";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import {
  NotionAlert,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import { N7DeviceCardList } from "@/components/n7/N7DeviceCardList";
import type { N7FollowUpPatchResult } from "@/components/n7/N7FollowUpStatusCell";
import type { N7DeviceListItem } from "@/services/n7/analytics";

type DeviceRow = N7DeviceListItem;

interface ApiResponse {
  dateFrom: string;
  dateTo: string;
  manager: { key: string; name: string } | null;
  counts: {
    urgent: number;
    pending: number;
    other: number;
    qualified: number;
    followUp: number;
    expand: number;
    expired: number;
  };
  queues: {
    urgent: DeviceRow[];
    other: DeviceRow[];
  };
  listCap: number;
}

export function N7TodayView({
  forcedManagerKey = null,
}: {
  forcedManagerKey?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);
  const showManager = !forcedManagerKey;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  /** null = 非经理或无权；数字 = 经理未读数 */
  const [mgrUnread, setMgrUnread] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useRestoreListScroll(pathname, !loading && !!data);

  function pushQuery(patch: { dateFrom?: string; dateTo?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    applyN7DateRangeToParams(
      params,
      patch.dateFrom ?? dateFrom,
      patch.dateTo ?? dateTo
    );
    router.replace(`${n7Path()}?${params.toString()}`, { scroll: false });
  }

  const bumpRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) bumpRefresh();
    }
    function onVisible() {
      if (document.visibilityState === "visible") bumpRefresh();
    }
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(N7_NOTIFICATIONS_CHANGED, bumpRefresh);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(N7_NOTIFICATIONS_CHANGED, bumpRefresh);
    };
  }, [bumpRefresh]);

  useEffect(() => {
    let cancelled = false;
    const silent = refreshKey > 0 && data != null;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    const params = new URLSearchParams(rangeQs);
    if (forcedManagerKey) {
      params.set("managerKey", forcedManagerKey);
    }
    fetch(`/api/n7/today?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled && !silent) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled && !silent) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // data 刻意不进依赖：仅用 refreshKey 触发静默刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeQs, forcedManagerKey, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/n7/notifications?countOnly=1")
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setMgrUnread(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) setMgrUnread(Number(json.unread) || 0);
      })
      .catch(() => {
        if (!cancelled) setMgrUnread(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeQs, refreshKey]);

  const followBase = forcedManagerKey
    ? `${n7Path("/follow-up")}?${rangeQs}&managerKey=${encodeURIComponent(forcedManagerKey)}`
    : `${n7Path("/follow-up")}?${rangeQs}`;
  const pendingHref = `${followBase}&follow=pending`;
  const expiredHref = `${followBase}&status=expired`;

  function applyFollowUpChange(
    deviceSn: string,
    next: N7FollowUpPatchResult
  ) {
    setData((prev) => {
      if (!prev) return prev;
      const patchRow = (d: DeviceRow) =>
        d.deviceSn === deviceSn
          ? {
              ...d,
              followUpDone: next.followUpDone,
              followUpNote: next.followUpNote,
            }
          : d;
      const prevRow = prev.queues.urgent.find((d) => d.deviceSn === deviceSn);
      let pending = prev.counts.pending;
      let urgentCount = prev.counts.urgent;
      let urgent = prev.queues.urgent.map(patchRow);
      if (prevRow && !prevRow.followUpDone && next.followUpDone) {
        pending = Math.max(0, pending - 1);
        urgent = urgent.filter((d) => d.deviceSn !== deviceSn);
        urgentCount = Math.max(0, urgentCount - 1);
      } else if (prevRow && prevRow.followUpDone && !next.followUpDone) {
        pending += 1;
      }
      return {
        ...prev,
        counts: { ...prev.counts, pending, urgent: urgentCount },
        queues: {
          urgent,
          other: prev.queues.other,
        },
      };
    });
  }

  const shortcuts = data
    ? [
        {
          id: "pending",
          label: "未处理",
          value: data.counts.pending,
          hint: "去达标跟进处理",
          href: pendingHref,
          tone: "amber" as const,
        },
        {
          id: "qualified",
          label: "区间已达标",
          value: data.counts.qualified,
          hint: "去数据看板",
          href: `${n7Path("/board")}?${rangeQs}`,
          tone: "green" as const,
        },
        {
          id: "expired",
          label: "过期未达标",
          value: data.counts.expired,
          hint: "复盘用",
          href: expiredHref,
          tone: "muted" as const,
        },
      ]
    : [];

  const toneClass = {
    amber: "border-amber-100 bg-amber-50/80 hover:bg-amber-50",
    green: "border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50",
    muted: "border-[#eef2f7] bg-white hover:bg-[#f8fafc]",
  };

  const valueClass = {
    amber: "text-amber-800",
    green: "text-emerald-800",
    muted: "text-[#64748b]",
  };

  const more =
    data && data.counts.urgent > data.queues.urgent.length
      ? {
          href: `${followBase}&priority=P0`,
          label:
            data.counts.urgent > data.listCap
              ? `本页已显 ${data.queues.urgent.length} 条，查看全部 ${data.counts.urgent} →`
              : `显示全部 ${data.counts.urgent} →`,
        }
      : null;

  return (
    <PageShell>
      <PageHeader
        title="今日待办"
        kicker="支付宝 N7"
        actions={
          <N7DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(next) => pushQuery(next)}
          />
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && (
        <p className="text-sm text-[#94a3b8]">正在加载今日待办…</p>
      )}

      {!loading && data && (
        <div className="space-y-6">
          {mgrUnread != null && (
            <Link
              href={n7Path("/notifications")}
              className={`flex items-center justify-between rounded-[14px] border px-3.5 py-3 text-sm font-medium transition-colors ${
                mgrUnread > 0
                  ? "border-[#14532d] bg-[#166534] text-white hover:bg-[#15803d]"
                  : "border-[#166534]/35 bg-[#ecfdf5] text-[#14532d] hover:bg-[#d1fae5]"
              }`}
            >
              <span className="flex items-center gap-2">
                队员已处理
                {mgrUnread > 0 ? (
                  <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-[#ef4444] px-1.5 py-0.5 text-center text-xs font-semibold leading-none text-white tabular-nums">
                    {mgrUnread > 99 ? "99+" : mgrUnread}
                  </span>
                ) : null}
              </span>
              <span
                className={mgrUnread > 0 ? "text-white/85" : "text-[#166534]"}
              >
                {mgrUnread > 0 ? "待审阅 ›" : "查看 ›"}
              </span>
            </Link>
          )}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {shortcuts.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className={`rounded-[14px] border px-2.5 py-3 text-left transition-colors sm:px-3 ${toneClass[card.tone]}`}
              >
                <p className="text-[0.7rem] font-medium text-[#64748b] sm:text-xs">
                  {card.label}
                </p>
                <p
                  className={`mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${valueClass[card.tone]}`}
                >
                  {card.value}
                </p>
                <p className="mt-1 text-[0.65rem] leading-snug text-[#94a3b8] sm:text-[0.7rem]">
                  {card.hint}
                </p>
              </Link>
            ))}
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                系统催办{" "}
                <span className="tabular-nums text-[#64748b] font-medium">
                  {data.counts.urgent}
                </span>
              </h2>
            </div>
            <N7DeviceCardList
              devices={data.queues.urgent}
              showManager={showManager}
              rangeQs={rangeQs}
              emptyText="暂无快到期设备，可去达标跟进看其余名单"
              {...(more
                ? { moreHref: more.href, moreLabel: more.label }
                : {})}
              onFollowUpChanged={applyFollowUpChange}
            />
          </section>
        </div>
      )}
    </PageShell>
  );
}
