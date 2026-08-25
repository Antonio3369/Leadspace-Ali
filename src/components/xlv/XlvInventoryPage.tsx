"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readResponseJson, getFetchErrorMessage } from "@/lib/fetch-json";
import { XLV_INVENTORY_STATUS_LABEL, XLV_WITHDRAW_IMPORT_ENABLED } from "@/lib/xlv-inventory";
import type { XlvInventoryStatus } from "@/lib/xlv-inventory";
import type { InventoryOverview } from "@/services/xlv/inventory/service";
import { XlvInventoryOverview } from "@/components/xlv/XlvInventoryOverview";
import {
  NotionAlert,
  NotionButton,
  NotionCallout,
  NotionPanel,
  NotionTabs,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";

type InventoryKind =
  | "inbound"
  | "allocate-manager"
  | "recall-to-admin"
  | "allocate-sales"
  | "withdraw"
  | "opening";

type Summary = {
  counts: Record<XlvInventoryStatus, number>;
  pendingReceipt: number;
  total: number;
};

type ImportResult = {
  batchId: string;
  totalRows: number;
  successRows: number;
  skippedRows: number;
  errors: string[];
  warnings: string[];
  deployedCount?: number;
  stockCount?: number;
  dedupedRows?: number;
  dryRun?: boolean;
  skipExisting?: boolean;
};

type PendingItem = { deviceSn: string; channel: string | null; updatedAt: string };

const ADMIN_TABS_ALL: { id: InventoryKind | "receipts" | "overview"; label: string }[] = [
  { id: "overview", label: "库存看板" },
  { id: "opening", label: "期初盘点" },
  { id: "inbound", label: "新增入库" },
  { id: "recall-to-admin", label: "回拨机具" },
  { id: "allocate-manager", label: "划拨下级" },
  { id: "withdraw", label: "撤机" },
  { id: "receipts", label: "待收货确认" },
];

const MANAGER_TABS_ALL: { id: InventoryKind | "receipts" | "overview"; label: string }[] = [
  { id: "overview", label: "库存看板" },
  { id: "receipts", label: "待收货确认" },
  { id: "allocate-sales", label: "分给队员" },
  { id: "withdraw", label: "撤机" },
];

const ADMIN_TABS = XLV_WITHDRAW_IMPORT_ENABLED
  ? ADMIN_TABS_ALL
  : ADMIN_TABS_ALL.filter((t) => t.id !== "withdraw");

const MANAGER_TABS = XLV_WITHDRAW_IMPORT_ENABLED
  ? MANAGER_TABS_ALL
  : MANAGER_TABS_ALL.filter((t) => t.id !== "withdraw");

const KIND_HINT: Record<InventoryKind, string> = {
  inbound: "列：设备SN（必填）、渠道（可选）",
  "recall-to-admin":
    "列：设备SN（必填）、备注（可选）；从经理/队员库存回拨至事业部总库；已铺设设备请先通过 SN 归属换商户推断撤机后再回拨",
  "allocate-manager": "列：设备SN、所属经理；可选渠道",
  "allocate-sales": "列：设备SN、作业员（或所属业务员）",
  withdraw:
    "撤机（移机明细表）：进件日期、设备SN、所属业务员、所属经理、门店名称；同 SN 取最新进件日期；提交后通知归属人确认，同意后才回库并清零运营态",
  opening:
    "期初表：设备SN、所属经理、渠道、作业员；须先导入 SN 归属表；在归属表内=已铺设，表外=库存。默认同 SN 已有库存账则跳过；取消勾选才会覆盖（可改经理名）",
};

const KIND_BUTTON: Record<InventoryKind, string> = {
  inbound: "入库",
  "recall-to-admin": "回拨机具",
  "allocate-manager": "划拨下级",
  "allocate-sales": "分给队员",
  withdraw: "导入撤机",
  opening: "导入期初盘点",
};

export function XlvInventoryPage({ isAdmin }: { isAdmin: boolean }) {
  const tabs = isAdmin ? ADMIN_TABS : MANAGER_TABS;
  const [tab, setTab] = useState<string>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/xlv/inventory");
      const data = await readResponseJson<{
        summary: Summary;
        overview: InventoryOverview;
      }>(res);
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "加载失败");
      setSummary(data.summary);
      setOverview(data.overview);
    } catch (e) {
      setError(getFetchErrorMessage(e));
    }
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/xlv/inventory/receipts");
      const data = await readResponseJson<{ items: PendingItem[] }>(res);
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "加载失败");
      setPending(data.items);
      setSelected(new Set(data.items.map((i) => i.deviceSn)));
    } catch (e) {
      setError(getFetchErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    if (tab === "receipts") void loadPending();
  }, [loadSummary, loadPending, tab]);

  async function handleUpload(kind: InventoryKind, uploadFile: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      const qs = new URLSearchParams({ kind });
      if (kind === "opening" && dryRun) qs.set("dryRun", "1");
      if (kind === "opening" && skipExisting) qs.set("skipExisting", "1");
      const res = await fetch(`/api/xlv/inventory/import?${qs}`, {
        method: "POST",
        body: fd,
      });
      const data = await readResponseJson<ImportResult>(res);
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "导入失败");
      setResult(data);
      setFile(null);
      setFileInputKey((k) => k + 1);
      await loadSummary();
      if (kind !== "opening" || !dryRun) await loadPending();
    } catch (e) {
      setError(getFetchErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function startUpload(kind: InventoryKind) {
    if (!file) {
      fileInputRef.current?.click();
      return;
    }
    void handleUpload(kind, file);
  }

  async function confirmReceipt() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/xlv/inventory/receipts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceSns: [...selected] }),
      });
      const data = await readResponseJson<ImportResult>(res);
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "确认失败");
      setResult(data);
      await loadSummary();
      await loadPending();
    } catch (e) {
      setError(getFetchErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function renderUpload(kind: InventoryKind) {
    const uploadLabel =
      kind === "opening" && dryRun
        ? "预览期初（不写库）"
        : KIND_BUTTON[kind];

    return (
      <NotionPanel className="space-y-4">
        <NotionCallout tone="info">{KIND_HINT[kind]}</NotionCallout>
        {kind === "opening" && isAdmin && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#64748b]">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              仅预览（dry-run，不写库）
            </label>
            <label className="flex items-center gap-2 text-sm text-[#64748b]">
              <input
                type="checkbox"
                checked={skipExisting}
                onChange={(e) => setSkipExisting(e.target.checked)}
              />
              跳过已有库存记录（不覆盖已铺设 / 经理库 / 队员库）
            </label>
          </div>
        )}

        <input
          key={fileInputKey}
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={loading}
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            setResult(null);
            setError(null);
          }}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <NotionButton
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto min-h-[44px]"
          >
            选择 Excel 文件
          </NotionButton>
          <NotionButton
            type="button"
            disabled={loading || !file}
            onClick={() => startUpload(kind)}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {loading ? "处理中…" : uploadLabel}
          </NotionButton>
        </div>

        {file ? (
          <p className="text-sm text-[#475569]">
            已选择：<span className="font-medium text-[#111827]">{file.name}</span>
          </p>
        ) : (
          <p className="text-sm text-[#94a3b8]">请先选择 .xlsx 文件，再点击导入</p>
        )}
        {loading && kind === "opening" && (
          <p className="text-sm text-[#64748b]">
            {dryRun
              ? "正在预览期初分配，约需几秒…"
              : "正在写入期初台账（约 1200 行），约需 1～2 分钟，请勿重复点击…"}
          </p>
        )}
      </NotionPanel>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="设备库存"
        meta={
          XLV_WITHDRAW_IMPORT_ENABLED
            ? "入库 · 分货 · 撤机（物流账）；运营考核仍走数据导入"
            : "入库 · 分货（物流账）；撤机改由 SN 归属换商户推断；运营考核仍走数据导入"
        }
      />

      {summary && tab !== "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          {(Object.keys(XLV_INVENTORY_STATUS_LABEL) as XlvInventoryStatus[]).map(
            (k) => (
              <NotionPanel key={k} className="text-center py-3">
                <p className="text-xs text-[#94a3b8]">{XLV_INVENTORY_STATUS_LABEL[k]}</p>
                <p className="text-xl font-semibold text-[#111827]">
                  {summary.counts[k] ?? 0}
                </p>
              </NotionPanel>
            )
          )}
        </div>
      )}

      <NotionTabs
        tabs={tabs.map((t) => ({ key: t.id, label: t.label }))}
        active={tab}
        onChange={(id) => {
          setTab(id);
          setFile(null);
          setResult(null);
          setError(null);
          setFileInputKey((k) => k + 1);
        }}
      />

      <div className="mt-4">
        {tab === "overview" && overview ? (
          <XlvInventoryOverview overview={overview} isAdmin={isAdmin} />
        ) : tab === "receipts" ? (
          <NotionPanel className="space-y-4">
            <p className="text-sm text-[#64748b]">
              Admin 划拨后，经理在此确认收货。待确认：{pending.length} 台
            </p>
            {pending.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">暂无待确认设备</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto text-sm space-y-1 border rounded-lg p-3">
                {pending.map((item) => (
                  <li key={item.deviceSn} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(item.deviceSn)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(item.deviceSn);
                        else next.delete(item.deviceSn);
                        setSelected(next);
                      }}
                    />
                    <span className="font-mono">{item.deviceSn}</span>
                    {item.channel && (
                      <span className="text-[#94a3b8]">{item.channel}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!isAdmin && (
              <NotionButton
                disabled={loading || selected.size === 0}
                onClick={() => void confirmReceipt()}
              >
                确认收货（{selected.size} 台）
              </NotionButton>
            )}
            {isAdmin && (
              <NotionCallout tone="warning">
                管理员账号仅预览待确认列表；请经理登录确认收货。
              </NotionCallout>
            )}
          </NotionPanel>
        ) : (
          renderUpload(tab as InventoryKind)
        )}
      </div>

      {error && (
        <div className="mt-4">
          <NotionAlert tone="error">{error}</NotionAlert>
        </div>
      )}

      {result && (
        <NotionPanel className="mt-4 space-y-2 text-sm">
          <p className="font-medium text-[#111827]">导入结果</p>
          <p>
            成功 {result.successRows} / {result.totalRows}，跳过 {result.skippedRows}
            {result.dedupedRows != null && `（去重后 ${result.dedupedRows} 行）`}
          </p>
          {result.deployedCount != null && (
            <p>
              期初：将写入已铺设 {result.deployedCount}，库存 {result.stockCount}
              {result.dryRun && "（未写库）"}
              {result.skipExisting && result.skippedRows > 0 && "；已有记录已跳过"}
            </p>
          )}
          {result.warnings?.slice(0, 8).map((w) => (
            <p key={w} className="text-[#b45309]">
              {w}
            </p>
          ))}
        </NotionPanel>
      )}
    </PageShell>
  );
}
