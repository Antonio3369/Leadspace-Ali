"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { xlvPath } from "@/lib/business-lines";
import {
  resumeImportJobPoll,
  uploadImportWithJobPoll,
} from "@/lib/import-upload-client";
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

type ImportTab = "raw" | "roster" | "assignment";

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
      "上传微信侧导出的原始表（含「统计日期」等列）。按 SN + 统计日期写入快照与最新指标。大表约需 3–8 分钟，上传后请勿关闭页面、勿重复点击。",
    endpoint: "/api/import/xlv",
    buttonLabel: "导入原始表",
  },
  roster: {
    title: "组织名册",
    description:
      "上传经理–队员关系表（含「所属作业员」「所属经理」，无需设备 SN）。导入后请到「人员归属核对」点击「从名册同步」，将经理/公司写回设备。",
    endpoint: "/api/import/xlv",
    buttonLabel: "导入组织名册",
  },
  assignment: {
    title: "SN 归属表",
    description:
      "按设备 SN 挂作业员（「所属作业员」必填；「所属经理」可省略，系统从组织名册反查）。建议顺序：① 原始表 → ② 名册 → ③ 本表。",
    endpoint: "/api/import/xlv",
    buttonLabel: "导入 SN 归属表",
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
  const resumeCheckedRef = useRef(false);

  useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;

    let cancelled = false;
    void (async () => {
      setUploading(true);
      setError("");
      setMessage("");
      setResult(null);
      try {
        const res = await resumeImportJobPoll<XlvImportResult>(
          "/api/import/xlv",
          (value, label) => {
            if (!cancelled) {
              setProgress(value);
              setProgressLabel(label);
            }
          }
        );
        if (cancelled || !res) return;
        setResult(res);
        setMessage("导入完成");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "导入失败");
        }
      } finally {
        if (!cancelled) {
          setUploading(false);
          setProgress(0);
          setProgressLabel("");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
        meta={
          <p className="text-sm text-[#64748b]">
            建议顺序：① 运营原始表 → ② 组织名册 → ③ SN 归属表。
            {" "}
            <Link
              href={xlvPath("/admin/attribution")}
              className="text-[#2563eb] hover:text-[#1d4ed8] font-medium"
            >
              人员归属核对 →
            </Link>
          </p>
        }
      />

      <NotionTabs
        tabs={[
          { key: "raw", label: "① 运营原始表" },
          { key: "roster", label: "② 组织名册" },
          { key: "assignment", label: "③ SN 归属" },
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
          <NotionProgressBar
            value={progress}
            label={progressLabel || (tab === "raw" ? "大表导入中，请稍候…" : "处理中…")}
          />
        )}

        {error && (
          <NotionAlert tone="error">
            <p>{error}</p>
            {error.includes("登录") ? (
              <p className="mt-2">
                <Link href="/login" className="font-medium text-[#2563eb] hover:text-[#1d4ed8]">
                  前往登录 →
                </Link>
              </p>
            ) : null}
          </NotionAlert>
        )}
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
