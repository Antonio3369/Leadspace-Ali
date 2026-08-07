"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import {
  NotionAlert,
  NotionCallout,
  NotionInput,
  NotionSelect,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { XlvDeviceCardList } from "@/components/xlv/XlvDeviceCardList";
import type { XlvTodayDeviceItem } from "@/services/xlv/today";

interface ApiResponse {
  searchMode: boolean;
  counts: {
    P0: number;
    P1: number;
    P2: number;
    pendingFollowUp: number;
    total: number;
  };
  queues: {
    P0: XlvTodayDeviceItem[];
    P1: XlvTodayDeviceItem[];
    P2: XlvTodayDeviceItem[];
  };
  listCap: number;
}

const TONE_CLASS = {
  red: "border-[#fecaca] bg-[#fef2f2]/80 hover:bg-[#fef2f2]",
  amber: "border-amber-100 bg-amber-50/80 hover:bg-amber-50",
  sky: "border-sky-100 bg-sky-50/60 hover:bg-sky-50",
} as const;

const VALUE_CLASS = {
  red: "text-[#b91c1c]",
  amber: "text-amber-800",
  sky: "text-sky-800",
} as const;

export function XlvTodayView({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const manager = searchParams.get("manager") ?? "";
  const operator = searchParams.get("operator") ?? "";
  const search = searchParams.get("q") ?? "";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState(search);
  const [managers, setManagers] = useState<string[]>([]);
  const [operators, setOperators] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useRestoreListScroll(pathname, !loading && !!data);

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
    function onVisible() {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const silent = refreshKey > 0 && data != null;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    const params = new URLSearchParams();
    if (manager) params.set("manager", manager);
    if (operator) params.set("operator", operator);
    if (search) params.set("q", search);

    fetch(`/api/xlv/today?${params}`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager, operator, search, refreshKey]);

  useEffect(() => {
    fetch("/api/xlv/dashboard")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) return;
        setManagers(json.filters?.managers ?? []);
        setOperators(json.filters?.operators ?? []);
      })
      .catch(() => {});
  }, []);

  const showManagerFilter = role === "DIRECTOR";
  const showOperatorFilter = role === "DIRECTOR" || role === "MANAGER";

  const shortcuts = data
    ? [
        {
          id: "p0",
          label: "优先催办",
          value: data.counts.P0,
          hint: "单笔沉默 / 沉睡≥7天",
          href: `${xlvPath("/follow-up")}?follow=pending&priority=P0`,
          tone: "red" as const,
        },
        {
          id: "p1",
          label: "一般沉睡",
          value: data.counts.P1,
          hint: "沉睡<7天待回访",
          href: `${xlvPath("/follow-up")}?follow=pending&priority=P1`,
          tone: "amber" as const,
        },
        {
          id: "p2",
          label: "考核将到期",
          value: data.counts.P2,
          hint: "两月窗口剩≤7天",
          href: `${xlvPath("/alerts")}?status=in_progress`,
          tone: "sky" as const,
        },
      ]
    : [];

  function moreLink(count: number, shown: number, href: string) {
    if (count <= shown) return null;
    return {
      href,
      label:
        count > (data?.listCap ?? 40)
          ? `本页已显 ${shown} 条，查看全部 ${count} →`
          : `显示全部 ${count} →`,
    };
  }

  const sections = data
    ? search
      ? [
          {
            key: "search",
            title: "搜索结果",
            count: data.counts.total,
            devices: [
              ...data.queues.P0,
              ...data.queues.P1,
              ...data.queues.P2,
            ],
            empty: "未找到匹配待办",
            showFollowUp: true,
            showQualification: true,
            more: null,
          },
        ]
      : [
          {
            key: "P0",
            title: "优先催办",
            count: data.counts.P0,
            devices: data.queues.P0,
            empty: "暂无优先催办项",
            showFollowUp: true,
            showQualification: false,
            more: moreLink(
              data.counts.P0,
              data.queues.P0.length,
              `${xlvPath("/follow-up")}?follow=pending&priority=P0`
            ),
          },
          {
            key: "P1",
            title: "沉睡待回访",
            count: data.counts.P1,
            devices: data.queues.P1,
            empty: "暂无一般沉睡待回访",
            showFollowUp: true,
            showQualification: false,
            more: moreLink(
              data.counts.P1,
              data.queues.P1.length,
              `${xlvPath("/follow-up")}?follow=pending&priority=P1`
            ),
          },
          {
            key: "P2",
            title: "考核将到期",
            count: data.counts.P2,
            devices: data.queues.P2,
            empty: "暂无考核将到期设备",
            showFollowUp: false,
            showQualification: true,
            more: moreLink(
              data.counts.P2,
              data.queues.P2.length,
              `${xlvPath("/alerts")}?status=in_progress`
            ),
          },
        ]
    : [];

  return (
    <PageShell>
      <PageHeader
        title="今日待办"
        kicker="微信小绿盒"
        actions={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <NotionInput
              placeholder="搜索商户 / SN / 作业员"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="w-full sm:w-52"
            />
            {showManagerFilter ? (
              <NotionSelect
                value={manager}
                onChange={(e) =>
                  pushQuery({
                    manager: e.target.value || null,
                    operator: null,
                  })
                }
                className="sm:w-40"
              >
                <option value="">全部经理</option>
                {managers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </NotionSelect>
            ) : null}
            {showOperatorFilter ? (
              <NotionSelect
                value={operator}
                onChange={(e) => pushQuery({ operator: e.target.value || null })}
                className="sm:w-40"
              >
                <option value="">全部作业员</option>
                {operators.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </NotionSelect>
            ) : null}
          </div>
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}

      {!search && (
        <NotionCallout>
          <p>
            优先催办：单笔沉默，或沉睡 ≥7 天且未回访。一般沉睡待回访、考核将到期（两月窗口剩
            ≤7 天仍未达标）分列展示；关单请进设备详情或沉睡回访。
          </p>
        </NotionCallout>
      )}

      {loading && !data ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : null}

      {data ? (
        <div className="space-y-6">
          {!search && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {shortcuts.map((card) => (
                <Link
                  key={card.id}
                  href={card.href}
                  className={`rounded-[14px] border px-2.5 py-3 text-left transition-colors sm:px-3 ${TONE_CLASS[card.tone]}`}
                >
                  <p className="text-[0.7rem] font-medium text-[#64748b] sm:text-xs">
                    {card.label}
                  </p>
                  <p
                    className={`mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${VALUE_CLASS[card.tone]}`}
                  >
                    {card.value}
                  </p>
                  <p className="mt-1 text-[0.65rem] leading-snug text-[#94a3b8] sm:text-[0.7rem]">
                    {card.hint}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {sections.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-[#111827]">
                  {section.title}{" "}
                  <span className="tabular-nums text-[#64748b] font-medium">
                    {section.count}
                  </span>
                </h2>
                {section.more ? (
                  <Link
                    href={section.more.href}
                    className="text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
                  >
                    {section.more.label}
                  </Link>
                ) : null}
              </div>
              <XlvDeviceCardList
                devices={section.devices}
                showManager={role === "DIRECTOR"}
                linkToDetail
                showQualification={section.showQualification}
                showFollowUpStatus={section.showFollowUp}
                emptyText={section.empty}
              />
            </section>
          ))}

          {!search && data.counts.total === 0 ? (
            <p className="text-sm text-[#94a3b8] text-center py-6">
              今日暂无待办，可去
              <Link href={xlvPath("/alerts")} className="text-[#2563eb] hover:underline mx-1">
                沉睡预警
              </Link>
              查看全局概况。
            </p>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
