"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readResponseJson } from "@/lib/fetch-json";
import { xlvPath } from "@/lib/business-lines";
import {
  NotionAlert,
  NotionButton,
  NotionCallout,
  NotionInput,
  NotionPanel,
  NotionSelect,
  NotionTabs,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";

type AttributionTab = "managers" | "operators" | "devices";

interface AttributionReport {
  summary: {
    assignedDevices: number;
    devicesMissingManagerId: number;
    devicesMissingSalesId: number;
    devicesNotInRoster?: number;
    unmatchedManagerNames: number;
    unmatchedOperatorNames: number;
  };
  unmatchedManagers: { name: string; deviceCount: number }[];
  unmatchedOperators: {
    name: string;
    managerName: string;
    deviceCount: number;
  }[];
}

interface UnattachedDevice {
  deviceSn: string;
  merchantName: string | null;
  operatorName: string;
  managerName: string;
  missingManager: boolean;
  missingOperator: boolean;
  notInRoster: boolean;
  managerSelfSale: boolean;
  operatorHint: string | null;
}

interface RosterLookup {
  managers: string[];
  operators: string[];
  roster: { operatorName: string; managerName: string; companyName: string | null }[];
}

export function XlvAttributionPage() {
  const [tab, setTab] = useState<AttributionTab>("devices");
  const [report, setReport] = useState<AttributionReport | null>(null);
  const [devices, setDevices] = useState<UnattachedDevice[]>([]);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [lookup, setLookup] = useState<RosterLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [missingFilter, setMissingFilter] = useState<"any" | "manager" | "operator">(
    "any"
  );
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<UnattachedDevice | null>(null);
  const [editManagerName, setEditManagerName] = useState("");
  const [editOperatorName, setEditOperatorName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadReport = useCallback(async () => {
    const res = await fetch("/api/xlv/admin/attribution");
    const json = await readResponseJson<{ error?: string } & AttributionReport>(
      res,
      "加载归属"
    );
    if (!res.ok) throw new Error(json.error || "加载失败");
    setReport(json);
  }, []);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const params = new URLSearchParams({
        view: "devices",
        missing: missingFilter,
        limit: "50",
        offset: String(offset),
      });
      if (search) params.set("q", search);
      const res = await fetch(`/api/xlv/admin/attribution?${params}`);
      const json = await readResponseJson<{
        error?: string;
        devices?: UnattachedDevice[];
        total?: number;
      }>(res, "加载设备");
      if (!res.ok) throw new Error(json.error || "加载失败");
      setDevices(json.devices ?? []);
      setDeviceTotal(json.total ?? 0);
    } finally {
      setDevicesLoading(false);
    }
  }, [missingFilter, offset, search]);

  const loadLookup = useCallback(async () => {
    const res = await fetch("/api/xlv/admin/attribution?view=lookup");
    const json = await readResponseJson<{ error?: string } & RosterLookup>(
      res,
      "加载名册"
    );
    if (!res.ok) throw new Error(json.error || "加载失败");
    setLookup(json);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([loadReport(), loadLookup()])
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
  }, [loadReport, loadLookup]);

  useEffect(() => {
    if (tab !== "devices") return;
    loadDevices().catch((err) => {
      setError(err instanceof Error ? err.message : "加载失败");
    });
  }, [tab, loadDevices]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== search) {
        setSearch(searchDraft);
        setOffset(0);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, search]);

  const operatorsForManager = useMemo(() => {
    if (!lookup || !editManagerName.trim()) return lookup?.operators ?? [];
    const names = lookup.roster
      .filter((r) => r.managerName === editManagerName.trim())
      .map((r) => r.operatorName);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [lookup, editManagerName]);

  async function handleSyncFromRoster() {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/xlv/admin/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relink" }),
      });
      const json = await readResponseJson<{
        error?: string;
        report?: AttributionReport;
        result?: { devicesUpdated?: number; userIdsCleared?: number };
        accountBackfill?: { created?: number; updated?: number };
      }>(res, "同步归属");
      if (!res.ok) throw new Error(json.error || "同步失败");
      if (json.report) setReport(json.report);
      const result = json.result ?? {};
      setMessage(
        [
          `已从组织名册同步 ${result.devicesUpdated ?? 0} 台设备；清除历史系统账号关联 ${result.userIdsCleared ?? 0} 条`,
          json.accountBackfill?.created
            ? `新开登录账号 ${json.accountBackfill.created} 个`
            : null,
          json.accountBackfill?.updated
            ? `补开通 ${json.accountBackfill.updated} 个`
            : null,
        ]
          .filter(Boolean)
          .join("；")
      );
      if (tab === "devices") await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  }

  function openEdit(device: UnattachedDevice) {
    setEditing(device);
    setEditManagerName(device.managerName ?? "");
    setEditOperatorName(device.operatorName ?? "");
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/xlv/admin/attribution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceSn: editing.deviceSn,
          managerName: editManagerName,
          operatorName: editOperatorName,
        }),
      });
      const json = await readResponseJson<{ error?: string }>(res, "保存归属");
      if (!res.ok) throw new Error(json.error || "保存失败");
      setEditing(null);
      setMessage(`已更新 ${editing.deviceSn} 的归属姓名`);
      await Promise.all([loadReport(), loadDevices()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const summary = report?.summary;
  const pageEnd = offset + devices.length;

  return (
    <PageShell>
      <PageHeader
        title="人员归属"
        kicker="微信小绿盒"
        meta={
          <div className="space-y-1 text-sm text-[#64748b]">
            <p>
              小绿盒以<strong>三表 Excel 姓名为准</strong>（运营原始表、组织名册、SN 归属），不关联 N7
              系统账号。此处列出姓名缺失、占位（如「待定」）或不在名册中的设备。
            </p>
            <p>
              <Link
                href={xlvPath("/admin/import")}
                className="text-[#2563eb] hover:text-[#1d4ed8] font-medium"
              >
                ← 返回数据导入
              </Link>
            </p>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={xlvPath("/admin/accounts")}>
              <NotionButton type="button" variant="secondary">
                经理账号
              </NotionButton>
            </Link>
            <NotionButton
              type="button"
              onClick={handleSyncFromRoster}
              disabled={syncing || loading}
            >
              {syncing ? "同步中…" : "从名册同步"}
            </NotionButton>
          </div>
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}
      {message ? <NotionAlert tone="success">{message}</NotionAlert> : null}

      {loading ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-[14px] border border-[#eef2f7] bg-white px-3 py-3 text-xs mb-4">
          <Stat label="已铺设设备" value={summary.assignedDevices} />
          <Stat label="缺经理姓名" value={summary.devicesMissingManagerId} tone="amber" />
          <Stat label="缺/占位队员" value={summary.devicesMissingSalesId} tone="amber" />
          <Stat
            label="待处理项"
            value={summary.unmatchedManagerNames + summary.unmatchedOperatorNames}
          />
        </div>
      ) : null}

      {!loading && summary?.assignedDevices === 0 ? (
        <NotionCallout>暂无已铺设设备，请先导入运营表与 SN 归属表。</NotionCallout>
      ) : null}

      <NotionTabs
        active={tab}
        onChange={(v) => setTab(v as AttributionTab)}
        tabs={[
          { key: "devices", label: "待完善归属" },
          { key: "managers", label: "缺经理姓名" },
          { key: "operators", label: "缺/异常队员" },
        ]}
      />

      <div className="mt-4">
        {tab === "managers" ? (
          <NameTable
            emptyText="所有已铺设设备均有有效经理姓名"
            rows={(report?.unmatchedManagers ?? []).map((row) => ({
              primary: row.name,
              secondary: null,
              count: row.deviceCount,
            }))}
          />
        ) : null}

        {tab === "operators" ? (
          <NameTable
            emptyText="所有队员姓名均已填写且在组织名册中"
            rows={(report?.unmatchedOperators ?? []).map((row) => ({
              primary: row.name,
              secondary: row.managerName ? `经理：${row.managerName}` : null,
              count: row.deviceCount,
            }))}
          />
        ) : null}

        {tab === "devices" ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <NotionInput
                placeholder="搜索 SN / 商户 / 姓名"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="sm:max-w-xs"
                aria-label="搜索设备"
              />
              <NotionSelect
                value={missingFilter}
                onChange={(e) => {
                  setMissingFilter(e.target.value as typeof missingFilter);
                  setOffset(0);
                }}
                className="sm:max-w-[200px]"
                aria-label="缺失类型"
              >
                <option value="any">全部待完善</option>
                <option value="manager">仅缺经理</option>
                <option value="operator">队员问题</option>
              </NotionSelect>
            </div>

            <NotionPanel className="overflow-hidden p-0">
              {devicesLoading ? (
                <p className="text-sm text-[#94a3b8] px-4 py-8 text-center">
                  加载中…
                </p>
              ) : devices.length === 0 ? (
                <p className="text-sm text-[#94a3b8] px-4 py-8 text-center">
                  当前筛选下暂无待完善设备
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-[#f1f5f9] text-left text-xs text-[#94a3b8]">
                        <th className="px-3 py-2.5">设备 / 商户</th>
                        <th className="px-3 py-2.5">经理</th>
                        <th className="px-3 py-2.5">队员</th>
                        <th className="px-3 py-2.5 w-20">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {devices.map((d) => (
                        <tr key={d.deviceSn} className="hover:bg-[#f8fafc]">
                          <td className="px-3 py-3">
                            <Link
                              href={xlvPath(`/devices/${encodeURIComponent(d.deviceSn)}`)}
                              className="font-medium text-[#2563eb] hover:text-[#1d4ed8] font-mono text-xs"
                            >
                              {d.deviceSn}
                            </Link>
                            <p className="text-xs text-[#64748b] truncate max-w-[220px]">
                              {d.merchantName || "—"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <p className="text-[#334155]">{d.managerName || "—"}</p>
                            {d.missingManager ? (
                              <p className="text-[10px] text-amber-700 mt-0.5">
                                经理姓名缺失或占位
                              </p>
                            ) : (
                              <p className="text-[10px] text-emerald-700 mt-0.5">已填写</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <p className="text-[#334155] font-medium">
                              {d.operatorName || "—"}
                            </p>
                            {d.managerSelfSale ? (
                              <p className="text-[10px] text-sky-700 mt-0.5 leading-snug">
                                经理自营拓展
                              </p>
                            ) : d.missingOperator || d.notInRoster ? (
                              <p className="text-[10px] text-amber-700 mt-0.5 leading-snug">
                                {d.operatorHint ?? "待完善"}
                              </p>
                            ) : (
                              <p className="text-[10px] text-emerald-700 mt-0.5">已填写</p>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => openEdit(d)}
                              className="text-xs font-medium text-[#2563eb] hover:text-[#1d4ed8]"
                            >
                              修正姓名
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </NotionPanel>

            {deviceTotal > 0 ? (
              <div className="flex items-center justify-between text-xs text-[#64748b]">
                <span>
                  共 {deviceTotal} 台 · 当前 {offset + 1}–{pageEnd}
                </span>
                <div className="flex gap-2">
                  <NotionButton
                    type="button"
                    variant="secondary"
                    disabled={offset === 0 || devicesLoading}
                    onClick={() => setOffset(Math.max(0, offset - 50))}
                  >
                    上一页
                  </NotionButton>
                  <NotionButton
                    type="button"
                    variant="secondary"
                    disabled={pageEnd >= deviceTotal || devicesLoading}
                    onClick={() => setOffset(offset + 50)}
                  >
                    下一页
                  </NotionButton>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-[14px] bg-white shadow-xl border border-[#eef2f7] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#111827]">修正归属姓名</p>
              <p className="text-xs text-[#64748b] font-mono mt-0.5">{editing.deviceSn}</p>
            </div>
            <label className="block text-xs space-y-1">
              <span className="text-[#64748b]">经理姓名</span>
              <NotionSelect
                value={editManagerName}
                onChange={(e) => {
                  setEditManagerName(e.target.value);
                  if (
                    editOperatorName &&
                    !lookup?.roster.some(
                      (r) =>
                        r.managerName === e.target.value &&
                        r.operatorName === editOperatorName
                    )
                  ) {
                    setEditOperatorName("");
                  }
                }}
              >
                <option value="">— 手动输入 / 清空 —</option>
                {(lookup?.managers ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </NotionSelect>
              <NotionInput
                value={editManagerName}
                onChange={(e) => setEditManagerName(e.target.value)}
                placeholder="或直接输入经理姓名"
              />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-[#64748b]">队员姓名</span>
              <NotionSelect
                value={editOperatorName}
                onChange={(e) => setEditOperatorName(e.target.value)}
              >
                <option value="">— 手动输入 / 清空 —</option>
                {operatorsForManager.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </NotionSelect>
              <NotionInput
                value={editOperatorName}
                onChange={(e) => setEditOperatorName(e.target.value)}
                placeholder="或直接输入队员姓名"
              />
            </label>
            <p className="text-[10px] text-[#94a3b8]">
              姓名以三表 Excel 为准；可从组织名册快速选取，也可手动修正。
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <NotionButton
                type="button"
                variant="secondary"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                取消
              </NotionButton>
              <NotionButton type="button" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </NotionButton>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "amber";
}) {
  return (
    <div>
      <p className="text-[#94a3b8]">{label}</p>
      <p
        className={`text-lg font-bold tabular-nums ${
          tone === "amber" ? "text-amber-800" : "text-[#111827]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function NameTable({
  rows,
  emptyText,
}: {
  rows: { primary: string; secondary: string | null; count: number }[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[#94a3b8] px-1 py-8 text-center">{emptyText}</p>
    );
  }
  return (
    <NotionPanel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-sm">
          <thead>
            <tr className="border-b border-[#f1f5f9] text-left text-xs text-[#94a3b8]">
              <th className="px-3 py-2.5">姓名</th>
              <th className="px-3 py-2.5">说明</th>
              <th className="px-3 py-2.5 text-right">设备数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {rows.map((row) => (
              <tr key={`${row.primary}-${row.secondary ?? ""}`}>
                <td className="px-3 py-3 font-medium text-[#111827]">{row.primary}</td>
                <td className="px-3 py-3 text-xs text-[#64748b]">{row.secondary ?? "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums text-[#334155]">
                  {row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NotionPanel>
  );
}
