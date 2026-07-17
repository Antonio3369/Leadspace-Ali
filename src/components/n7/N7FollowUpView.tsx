"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyN7DateRangeToParams,
  n7DateRangeQuery,
  readN7DateRangeFromSearchParams,
} from "@/lib/n7-date";
import { n7Path } from "@/lib/business-lines";
import type { N7Priority } from "@/lib/n7-rules";
import {
  NotionAlert,
  NotionButton,
  NotionSelect,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { N7DateRangePicker } from "@/components/n7/N7DateRangePicker";
import {
  N7_PRIORITY_FILTERS,
  n7FilterChipBaseClass,
  n7PriorityButtonClass,
  n7TabButtonClass,
} from "@/components/n7/n7-filter-styles";

type Filter = "all" | N7Priority;

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
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
  merchantPhone: string | null;
  operatorName: string;
  managerName: string;
  salesUserId: string | null;
  managerUserId: string | null;
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

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "待跟进" },
];

function PriorityBadge({ p }: { p: DeviceRow["priority"] }) {
  if (!p) return <span className="text-[#94a3b8]">—</span>;
  const color =
    p === "P0"
      ? "bg-red-50 text-red-700"
      : p === "P1"
        ? "bg-amber-50 text-amber-700"
        : p === "P2"
          ? "bg-orange-50 text-orange-700"
          : "bg-violet-50 text-violet-700";
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold ${color}`}>
      {p}
    </span>
  );
}

function managerKeyOf(d: DeviceRow) {
  return d.managerUserId ?? `name:${d.managerName}`;
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
  const searchParams = useSearchParams();
  const { dateFrom, dateTo } = readN7DateRangeFromSearchParams(searchParams);
  const rangeQs = n7DateRangeQuery(dateFrom, dateTo);
  const filter = (searchParams.get("priority") as Filter) || "all";
  const managerKey = forcedManagerKey ?? searchParams.get("managerKey");
  const staffKey = searchParams.get("staffKey") ?? "";
  const behaviorFilter = searchParams.get("behavior");

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  function pushQuery(
    patch: Partial<{
      dateFrom: string;
      dateTo: string;
      priority: Filter;
      staffKey: string | null;
      behavior: string | null;
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
    }
    if (patch.staffKey !== undefined) {
      if (patch.staffKey) params.set("staffKey", patch.staffKey);
      else params.delete("staffKey");
    }
    if (patch.behavior !== undefined) {
      if (patch.behavior) params.set("behavior", patch.behavior);
      else params.delete("behavior");
    }
    // 清掉旧的自由搜索参数
    params.delete("q");
    router.replace(`${n7Path("/follow-up")}?${params}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams(rangeQs);
    if (filter !== "all") params.set("priority", filter);
    if (managerKey) params.set("managerKey", managerKey);
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
  }, [rangeQs, filter, managerKey]);

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
    if (staffKey) {
      list = list.filter((d) => staffKeyOf(d) === staffKey);
    }
    return list;
  }, [data, behaviorFilter, staffKey]);

  // 当前选中的队员若不在名单中（例如切换了优先级），自动清空
  useEffect(() => {
    if (!staffKey || loading || !data) return;
    if (!staffOptions.some((s) => s.key === staffKey)) {
      pushQuery({ staffKey: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffKey, staffOptions, loading, data]);

  const isManagerHome = !!forcedManagerKey;
  const isDrillDown = !isManagerHome && !!managerKey;
  const backHref = isManagerHome
    ? `${n7Path()}?${rangeQs}`
    : managerKey
      ? `${n7Path(`/managers/${encodeURIComponent(managerKey)}`)}?${rangeQs}`
      : `${n7Path()}?${rangeQs}`;

  const title =
    filter === "all"
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
          <p className="text-sm text-[#64748b]">
            {isDrillDown ? (
              <>
                <Link href={backHref} className="text-[#2563eb] hover:text-[#1d4ed8]">
                  ← {data?.manager ? "队员排行" : "数据看板"}
                </Link>
                <span className="mx-2 text-[#cbd5e1]">/</span>
              </>
            ) : null}
            点击门店可查看设备详情
            {!loading && data ? ` · 当前 ${filtered.length} 条` : ""}
          </p>
        }
        trailing={
          <NotionButton
            onClick={handleExport}
            disabled={exporting || loading || filtered.length === 0}
            className="w-full sm:w-auto shrink-0 self-stretch sm:self-start"
          >
            {exporting ? "导出中..." : "导出表格"}
          </NotionButton>
        }
        actions={
          <N7DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(next) => pushQuery(next)}
            trailing={
              <NotionSelect
                value={staffKey}
                onChange={(e) =>
                  pushQuery({ staffKey: e.target.value || null })
                }
                className="w-full sm:w-56"
                aria-label="筛选队员"
              >
                <option value="">全部队员（有待跟进）</option>
                {staffOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}（{s.count}）
                  </option>
                ))}
              </NotionSelect>
            }
          />
        }
      />

      {exportError && <NotionAlert tone="error">{exportError}</NotionAlert>}

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && <p className="text-sm text-[#94a3b8]">正在加载待跟进设备…</p>}
      {!loading && data && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => {
                const active = filter === item.id && !behaviorFilter;
                const count = data.counts.followUp;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      pushQuery({ priority: item.id, behavior: null })
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
                const active = filter === item.id && !behaviorFilter;
                const count = data.counts[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.hint}
                    onClick={() =>
                      pushQuery({ priority: item.id, behavior: null })
                    }
                    className={`${n7FilterChipBaseClass()} ${n7PriorityButtonClass(item.id, active)}`}
                  >
                    {item.label} {count}
                  </button>
                );
              })}
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

          <div className="rounded-[14px] border border-[#eef2f7] bg-white shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#eef2f7] text-left text-[0.72rem] uppercase tracking-wide text-[#94a3b8]">
                  <th className="px-3 py-3 font-semibold">优先级</th>
                  <th className="px-3 py-3 font-semibold">剩余天数</th>
                  {!managerKey && (
                    <th className="px-3 py-3 font-semibold">经理</th>
                  )}
                  <th className="px-3 py-3 font-semibold">队员</th>
                  <th className="px-3 py-3 font-semibold">门店</th>
                  <th className="px-3 py-3 font-semibold">SN</th>
                  <th className="px-3 py-3 font-semibold text-right">天数</th>
                  <th className="px-3 py-3 font-semibold text-right">用户</th>
                  <th className="px-3 py-3 font-semibold">缺口 / 原因</th>
                  <th className="px-3 py-3 font-semibold">行为</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={managerKey ? 9 : 10}
                      className="px-4 py-8 text-center text-[#94a3b8]"
                    >
                      暂无待跟进设备
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc]"
                    >
                      <td className="px-3 py-2.5">
                        <PriorityBadge p={d.priority} />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {d.remainingEnded
                          ? "已结束"
                          : d.remainingDays == null
                            ? "—"
                            : d.remainingDays}
                      </td>
                      {!managerKey && (
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
                      <td className="px-3 py-2.5 font-mono text-xs text-[#64748b]">
                        {d.deviceSn}
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
                          : `差${d.daysGap}天·差${d.usersGap}人${
                              d.failReason ? ` · ${d.failReason}` : ""
                            }`}
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
