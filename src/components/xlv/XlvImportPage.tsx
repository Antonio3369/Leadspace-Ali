"use client";

import { useState } from "react";
import { uploadImportWithJobPoll } from "@/lib/import-upload-client";
import {
  NotionAlert,
  NotionButton,
  NotionInput,
  NotionPanel,
  NotionProgressBar,
  NotionTabs,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { XlvImportSummaryPanel } from "@/components/xlv/XlvImportSummaryPanel";
import type { XlvImportSummary } from "@/services/import/xlv-import-summary";

type ImportTab = "raw" | "personnel";

interface XlvImportResult {
  format?: string;
  status: string;
  totalRows: number;
  importedRows: number;
  snapshotRows?: number;
  createdDevices?: number;
  updatedDevices?: number;
  skippedRows?: number;
  sheetName?: string;
  errors?: string[];
  summary?: XlvImportSummary;
}

const TAB_CONFIG: Record<
  ImportTab,
  { title: string; description: string; endpoint: string; buttonLabel: string }
> = {
  raw: {
    title: "运营原始表",
    description:
      "上传微信侧导出的原始表（含「导出时间范围」「统计日期」等列）。支持同一文件内 8/1–8/4 多日快照；系统按 SN+统计日期写入历史快照，并更新设备最新状态。不会删除库中已有 SN。",
    endpoint: "/api/import/xlv",
    buttonLabel: "导入原始表",
  },
  personnel: {
    title: "人员归属表",
    description:
      "上传运营加工表（含「所属作业员」「所属经理」「商户名称」等列）。按 SN 合并人员归属与商户名；建议先导入原始表，再导入本表补齐归属。",
    endpoint: "/api/import/xlv",
    buttonLabel: "导入人员归属表",
  },
};

export function XlvImportPage() {
  const [tab, setTab] = useState<ImportTab>("raw");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<XlvImportResult | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const config = TAB_CONFIG[tab];

  async function handleImport() {
    if (!file) {
      setError("请先选择 .xlsx 文件");
      return;
    }
    setUploading(true);
    setError("");
    setMessage("");
    setResult(null);
    setProgress(10);

    try {
      const res = await uploadImportWithJobPoll<XlvImportResult>(
        config.endpoint,
        file,
        (value, label) => {
          setProgress(value);
          setProgressLabel(label);
        }
      );
      setResult(res);
      setMessage("导入完成");
      setFile(null);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setUploading(false);
      setProgress(0);
      setProgressLabel("");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="数据导入"
        kicker="微信小绿盒"
        meta={<p>原始表写快照与指标；人员表按 SN 合并作业员与经理归属。</p>}
      />

      <NotionTabs
        tabs={[
          { key: "raw", label: "运营原始表" },
          { key: "personnel", label: "人员归属表" },
        ]}
        active={tab}
        onChange={(id) => {
          setTab(id as ImportTab);
          setFile(null);
          setResult(null);
          setError("");
          setMessage("");
          setFileInputKey((k) => k + 1);
        }}
      />

      <NotionPanel className="mt-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#111827]">{config.title}</h2>
          <p className="mt-2 text-sm text-[#64748b] leading-relaxed">{config.description}</p>
        </div>

        <NotionInput
          key={fileInputKey}
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {uploading && (
          <NotionProgressBar value={progress} label={progressLabel || "处理中…"} />
        )}

        {error && <NotionAlert tone="error">{error}</NotionAlert>}
        {message && <NotionAlert tone="success">{message}</NotionAlert>}

        {result && (
          <div className="space-y-3">
            {result.summary ? (
              <XlvImportSummaryPanel summary={result.summary} />
            ) : (
              <div className="text-sm text-[#475569] space-y-1">
                <p>工作表：{result.sheetName ?? "—"}</p>
                <p>格式：{result.format ?? tab}</p>
                <p>总行数：{result.totalRows}</p>
                <p>写入设备：{result.importedRows}</p>
                {result.snapshotRows != null && <p>快照行：{result.snapshotRows}</p>}
              </div>
            )}
            {!result.summary && result.errors?.length ? (
              <p className="text-sm text-[#b45309]">提示：{result.errors.join("；")}</p>
            ) : null}
          </div>
        )}

        <NotionButton onClick={handleImport} disabled={uploading || !file}>
          {uploading ? "导入中…" : config.buttonLabel}
        </NotionButton>
      </NotionPanel>
    </PageShell>
  );
}
