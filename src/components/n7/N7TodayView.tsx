"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import { N7PriorityBadge } from "@/components/n7/N7PriorityBadge";
import {
  N7FollowUpStatusCell,
  type N7FollowUpPatchResult,
} from "@/components/n7/N7FollowUpStatusCell";
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
  };
  queues: {
    urgent: DeviceRow[];
    other: DeviceRow[];
  };
  listCap: number;
}

function managerKeyOf(d: DeviceRow) {
  return d.managerUserId ?? `name:${d.managerName}`;
}

function staffKeyOf(d: DeviceRow) {
  return d.salesUserId ?? `name:${d.operatorName}`;
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const PREVIEW_ROWS = 10;

function DeviceTable({
  devices,
  showManager,
  rangeQs,
  emptyText,
  totalCount,
  moreHref,
  onFollowUpChanged,
}: {
  devices: DeviceRow[];
  showManager: boolean;
  rangeQs: string;
  emptyText: string;
  /** 队列真实总数（可大于预览条数） */
  totalCount: number;
  moreHref?: string;
  onFollowUpChanged?: (
    deviceSn: string,
    next: N7FollowUpPatchResult
  ) => void;
}) {
  const rows = devices.slice(0, PREVIEW_ROWS);
  const hasMore = totalCount > PREVIEW_ROWS && !!moreHref;

  return (
    <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#eef2f7] text-left text-[0.72rem] uppercase tracking-wide text-[#94a3b8]">
              <th className="px-3 py-3 font-semibold">优先级</th>
              <th className="px-3 py-3 font-semibold">剩余天数</th>
              {showManager && (
                <th className="px-3 py-3 font-semibold">经理</th>
              )}
              <th className="px-3 py-3 font-semibold">队员</th>
              <th className="px-3 py-3 font-semibold">门店</th>
              <th className="px-3 py-3 font-semibold">处理状态</th>
              <th className="px-3 py-3 font-semibold text-right">已用天数</th>
              <th className="px-3 py-3 font-semibold text-right">已有用户</th>
              <th className="px-3 py-3 font-semibold">缺口</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={showManager ? 9 : 8}
                  className="px-4 py-8 text-center text-[#94a3b8]"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((d) => (
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
                  {showManager && (
                    <td className="px-3 py-2.5">
                      <Link
                        href={`${n7Path(
                          `/managers/${encodeURIComponent(managerKeyOf(d))}`
                        )}?${rangeQs}`}
                        className="text-[#2563eb] hover:text-[#1d4ed8]"
                      >
                        {d.managerName}
                      </Link>
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <Link
                      href={`${n7Path(
                        `/managers/${encodeURIComponent(managerKeyOf(d))}/staff/${encodeURIComponent(staffKeyOf(d))}`
                      )}?${rangeQs}&tab=followUp`}
                      className="text-[#2563eb] hover:text-[#1d4ed8]"
                    >
                      {d.operatorName}
                    </Link>
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
                      onChanged={(next) =>
                        onFollowUpChanged?.(d.deviceSn, next)
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {d.effectiveDays}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {d.effectiveUsers}
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b]">
                    {d.isQualified
                      ? "已达标"
                      : `差${d.daysGap}天·差${d.usersGap}人`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <div className="border-t border-[#eef2f7] bg-[#fafbfc]">
          <Link
            href={moreHref!}
            className="flex items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-[#2563eb] hover:bg-[#f1f5f9] hover:text-[#1d4ed8] transition-colors"
          >
            显示全部 {totalCount} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function QueueSection({
  id,
  title,
  hint,
  count,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold text-[#111827]">
          {title}{" "}
          <span className="tabular-nums text-[#64748b] font-medium">
            {count}
          </span>
        </h2>
        <p className="text-xs text-[#94a3b8] mt-0.5">{hint}</p>
      </div>
      {children}
    </section>
  );
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeQs, forcedManagerKey]);

  const followBase = `${n7Path("/follow-up")}?${rangeQs}`;
  const pendingHref = `${followBase}&follow=pending`;

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
      const prevRow =
        prev.queues.urgent.find((d) => d.deviceSn === deviceSn) ??
        prev.queues.other.find((d) => d.deviceSn === deviceSn);
      let pending = prev.counts.pending;
      if (prevRow && !prevRow.followUpDone && next.followUpDone) {
        pending = Math.max(0, pending - 1);
      } else if (prevRow && prevRow.followUpDone && !next.followUpDone) {
        pending += 1;
      }
      return {
        ...prev,
        counts: { ...prev.counts, pending },
        queues: {
          urgent: prev.queues.urgent.map(patchRow),
          other: prev.queues.other.map(patchRow),
        },
      };
    });
  }

  const cards = data
    ? [
        {
          id: "urgent",
          label: "今日必跟",
          value: data.counts.urgent,
          tone: "red" as const,
          hint: "考核还剩不到 3 天",
          action: "scroll" as const,
        },
        {
          id: "pending",
          label: "未处理",
          value: data.counts.pending,
          tone: "amber" as const,
          hint: "点此查看完整名单",
          action: "link" as const,
          href: pendingHref,
        },
        {
          id: "other",
          label: "其余待跟进",
          value: data.counts.other,
          tone: "sky" as const,
          hint: "未打卡/订阅 · 无动销等",
          action: "scroll" as const,
        },
        {
          id: "qualified",
          label: "区间已达标",
          value: data.counts.qualified,
          tone: "green" as const,
          hint: "点此看数据看板",
          action: "link" as const,
          href: `${n7Path("/board")}?${rangeQs}`,
        },
      ]
    : [];

  const toneClass = {
    red: "border-red-100 bg-red-50/80 hover:bg-red-50",
    amber: "border-amber-100 bg-amber-50/80 hover:bg-amber-50",
    sky: "border-sky-100 bg-sky-50/80 hover:bg-sky-50",
    green: "border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50",
  };

  const valueClass = {
    red: "text-red-700",
    amber: "text-amber-800",
    sky: "text-sky-800",
    green: "text-emerald-800",
  };

  return (
    <PageShell>
      <PageHeader
        title="今日待办"
        kicker="支付宝 N7"
        meta={
          <p className="text-sm text-[#64748b]">
            按考核紧急度处理跟进；排行与复盘在
            <Link
              href={`${n7Path("/board")}?${rangeQs}`}
              className="mx-1 font-medium text-[#2563eb] hover:text-[#1d4ed8]"
            >
              数据看板
            </Link>
            。列表可一键「标已处理」；写备注请进门店详情。
          </p>
        }
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
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card) => {
              const className = `rounded-[14px] border px-3.5 py-3.5 text-left transition-colors ${toneClass[card.tone]}`;
              const body = (
                <>
                  <p className="text-xs font-medium text-[#64748b]">
                    {card.label}
                  </p>
                  <p
                    className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${valueClass[card.tone]}`}
                  >
                    {card.value}
                  </p>
                  <p className="mt-1 text-[0.7rem] text-[#94a3b8]">
                    {card.hint}
                  </p>
                </>
              );
              if (card.action === "link" && card.href) {
                return (
                  <Link key={card.id} href={card.href} className={className}>
                    {body}
                  </Link>
                );
              }
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => scrollToSection(card.id)}
                  className={className}
                >
                  {body}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-[#94a3b8] -mt-4">
            区间内拓展 {data.counts.expand} 台 · 考核待跟进{" "}
            {data.counts.followUp} 台
            <Link
              href={followBase}
              className="ml-2 text-[#2563eb] hover:underline"
            >
              完整达标跟进 →
            </Link>
          </p>

          <QueueSection
            id="urgent"
            title="今日必跟"
            hint="考核还剩 0–2 天，优先联系"
            count={data.counts.urgent}
          >
            <DeviceTable
              devices={data.queues.urgent}
              showManager={showManager}
              rangeQs={rangeQs}
              emptyText="暂无快到期设备，可先看其余待跟进"
              totalCount={data.counts.urgent}
              moreHref={`${followBase}&priority=P0`}
              onFollowUpChanged={applyFollowUpChange}
            />
          </QueueSection>

          <QueueSection
            id="other"
            title="其余待跟进"
            hint="未点亮/未订阅/未打卡、尚无动销，以及考核期仍充裕的预警商户"
            count={data.counts.other}
          >
            <DeviceTable
              devices={data.queues.other}
              showManager={showManager}
              rangeQs={rangeQs}
              emptyText="暂无其余待跟进"
              totalCount={data.counts.other}
              moreHref={followBase}
              onFollowUpChanged={applyFollowUpChange}
            />
          </QueueSection>
        </div>
      )}
    </PageShell>
  );
}
