"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import {
  NotionAlert,
  NotionCallout,
  NotionInput,
  NotionSelect,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { XlvDeviceCardList } from "@/components/xlv/XlvDeviceCardList";
import type { XlvFollowUpDeviceItem } from "@/services/xlv/follow-up";

type FollowFilter = "pending" | "done" | "all";
type AlertFilter = "all" | "single_silence" | "dormant";
type PriorityFilter = "P0" | "P1";

interface ApiResponse {
  follow: FollowFilter;
  priority: PriorityFilter | null;
  counts: { pending: number; done: number; all: number };
  devices: XlvFollowUpDeviceItem[];
}

const TAB_CLASS = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors ${
    active
      ? "border-sky-300 bg-sky-50 text-sky-900"
      : "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc]"
  }`;

export function XlvFollowUpView({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const follow = (searchParams.get("follow") as FollowFilter) || "pending";
  const alert = (searchParams.get("alert") as AlertFilter) || "all";
  const priorityRaw = searchParams.get("priority");
  const priority: PriorityFilter | null =
    priorityRaw === "P0" || priorityRaw === "P1" ? priorityRaw : null;
  const manager = searchParams.get("manager") ?? "";
  const operator = searchParams.get("operator") ?? "";
  const search = searchParams.get("q") ?? "";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState(search);
  const [managers, setManagers] = useState<string[]>([]);
  const [operators, setOperators] = useState<string[]>([]);

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
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("follow", follow);
    if (alert !== "all") params.set("alert", alert);
    if (priority) params.set("priority", priority);
    if (manager) params.set("manager", manager);
    if (operator) params.set("operator", operator);
    if (search) params.set("q", search);

    fetch(`/api/xlv/follow-up?${params.toString()}`)
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
  }, [follow, alert, priority, manager, operator, search]);

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

  useEffect(() => {
    if (!operators.length || !operator) return;
    if (!operators.includes(operator)) pushQuery({ operator: null });
  }, [operators, operator, pushQuery]);

  const showManagerFilter = role === "DIRECTOR";
  const showOperatorFilter = role === "DIRECTOR" || role === "MANAGER";

  return (
    <PageShell>
      <PageHeader
        title="沉睡回访"
        kicker="微信小绿盒"
        meta={
          <HistoryBackLink
            label="← 返回今日待办"
            fallbackHref={xlvPath()}
            preferHistoryBack
            className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
          />
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["pending", `待回访${data ? ` (${data.counts.pending})` : ""}`],
            ["done", `已回访${data ? ` (${data.counts.done})` : ""}`],
            ["all", `全部沉睡${data ? ` (${data.counts.all})` : ""}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={TAB_CLASS(follow === value)}
            onClick={() =>
              pushQuery({
                follow: value === "pending" ? null : value,
                priority: value === "pending" ? priority : null,
              })
            }
          >
            {label}
          </button>
        ))}
      </div>

      {priority ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium ${
              priority === "P0"
                ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {priority === "P0" ? "仅优先催办" : "仅一般沉睡"}
          </span>
          <button
            type="button"
            className="text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
            onClick={() => pushQuery({ priority: null })}
          >
            清除筛选
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "全部类型"],
              ["single_silence", "单笔沉默"],
              ["dormant", "沉睡"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={TAB_CLASS(alert === value)}
              onClick={() => pushQuery({ alert: value === "all" ? null : value })}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <NotionInput
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="搜索商户 / SN / 作业员"
          className="flex-1"
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

      {follow === "pending" && data && !priority && data.counts.pending > 0 ? (
        <NotionCallout tone="warning">
          共 {data.counts.pending} 台沉睡设备待回访，请点进详情完成关单（需跟进图，至少一张）。
        </NotionCallout>
      ) : null}

      {follow === "pending" && priority && data ? (
        <NotionCallout tone="warning">
          当前筛选：
          {priority === "P0"
            ? "优先催办（单笔沉默或沉睡≥7天）"
            : "一般沉睡（沉睡<7天）"}
          ，共 {data.devices.length} 台。
        </NotionCallout>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : (
        <XlvDeviceCardList
          devices={data?.devices ?? []}
          showManager={role === "DIRECTOR"}
          linkToDetail
          showQualification={false}
          showFollowUpStatus
          emptyText={
            follow === "pending"
              ? priority === "P0"
                ? "暂无优先催办设备"
                : priority === "P1"
                  ? "暂无一般沉睡待回访"
                  : "暂无待回访设备"
              : follow === "done"
                ? "暂无已回访记录"
                : "暂无沉睡类设备"
          }
        />
      )}
    </PageShell>
  );
}
