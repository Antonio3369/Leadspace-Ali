"use client";
import { getFetchErrorMessage } from "@/lib/fetch-json";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { xlvPath } from "@/lib/business-lines";
import {
  followActiveImportJob,
  isImportJobBusyError,
  isImportRestartInterrupted,
  peekActiveImportJob,
  resumeOrFollowActiveImport,
  uploadImportWithJobPoll,
  type ImportJobSnapshot,
  type ImportRestartContext,
} from "@/lib/import-upload-client";
import { ImportInterruptedNotice } from "@/components/import/ImportInterruptedNotice";
import { ImportJobStatusPanel } from "@/components/import/ImportJobStatusPanel";
import {
  NotionAlert,
  NotionButton,
  NotionInput,
  NotionPanel,
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
      "① 先传本表（微信运营导出，含「统计日期」「当日*」「累计*」）。按 SN + 统计日期写快照；大表约 3–8 分钟，上传后保持页面打开、勿重复点。若提示中断，请先查看看板再决定是否重传。",
    endpoint: "/api/import/xlv",
    buttonLabel: "导入原始表",
  },
  roster: {
    title: "组织名册",
    description:
      "② 再传经理–队员名册（含「所属作业员」「所属经理」，无需 SN）。导入后请到「人员归属核对」点击「从名册同步」。",
    endpoint: "/api/import/xlv",
    buttonLabel: "导入组织名册",
  },
  assignment: {
    title: "SN 归属表",
    description:
      "③ 最后传 SN 归属（「所属作业员」或「所属业务员」必填；经理可省略，从名册反查）。仅补挂靠，不能替代原始表快照。",
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
  const [interrupted, setInterrupted] = useState<ImportRestartContext | null>(null);
  const [activeJob, setActiveJob] = useState<ImportJobSnapshot | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<XlvImportResult | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const config = TAB_CONFIG[tab];
  const resumeCheckedRef = useRef(false);
  const importEndpoint = "/api/import/xlv";

  async function refreshActiveJobPeek() {
    const job = await peekActiveImportJob(importEndpoint);
    setActiveJob(job);
    return job;
  }

  async function watchImportProgress() {
    setUploading(true);
    setError("");
    setInterrupted(null);

    const onProgress = (value: number, label: string) => {
      setProgress(value);
      setProgressLabel(label);
    };

    try {
      const res = await resumeOrFollowActiveImport<XlvImportResult>(
        importEndpoint,
        onProgress,
        (job) => {
          setActiveJob(job);
          if (job && (job.status === "PENDING" || job.status === "PROCESSING")) {
            setInterrupted(null);
          }
        }
      );
      if (res) {
        setResult(res);
        setMessage("导入完成");
        setActiveJob(null);
        setInterrupted(null);
      } else {
        await refreshActiveJobPeek();
      }
    } catch (err) {
      if (isImportRestartInterrupted(err)) {
        const peek = await refreshActiveJobPeek();
        if (
          peek &&
          (peek.status === "PENDING" || peek.status === "PROCESSING")
        ) {
          setInterrupted(null);
          const res = await followActiveImportJob<XlvImportResult>(
            importEndpoint,
            onProgress,
            setActiveJob
          );
          if (res) {
            setResult(res);
            setMessage("导入完成");
            setActiveJob(null);
          }
        } else {
          setInterrupted(err.context);
        }
      } else {
        setError(getFetchErrorMessage(err, "导入失败"));
      }
      if (!isImportRestartInterrupted(err)) {
        await refreshActiveJobPeek();
      }
    } finally {
      setUploading(false);
      setProgress(0);
      setProgressLabel("");
    }
  }

  useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;

    let cancelled = false;
    void (async () => {
      setError("");
      setMessage("");
      setInterrupted(null);
      setResult(null);
      const peek = await peekActiveImportJob(importEndpoint);
      if (!cancelled && peek) {
        setActiveJob(peek);
      }
      if (!cancelled) {
        await watchImportProgress();
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
    setInterrupted(null);
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
      if (isImportJobBusyError(err)) {
        setMessage("");
        try {
          const res = await followActiveImportJob<XlvImportResult>(
            importEndpoint,
            (value, label) => {
              setProgress(value);
              setProgressLabel(label);
            },
            setActiveJob
          );
          if (res) {
            setResult(res);
            setMessage("导入完成");
            setActiveJob(null);
            setFile(null);
            setFileInputKey((k) => k + 1);
          }
        } catch (followErr) {
          if (isImportRestartInterrupted(followErr)) {
            setInterrupted(followErr.context);
          } else {
            setError(
              followErr instanceof Error ? followErr.message : "导入失败"
            );
          }
        }
        return;
      }
      if (isImportRestartInterrupted(err)) {
        setInterrupted(err.context);
      } else {
        setError(getFetchErrorMessage(err, "导入失败"));
      }
    } finally {
      setUploading(false);
      setProgress(0);
      setProgressLabel("");
      void refreshActiveJobPeek();
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
          setInterrupted(null);
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

        <ImportJobStatusPanel
          job={activeJob}
          progress={uploading ? progress : activeJob?.progress ?? 0}
          progressLabel={
            progressLabel ||
            (tab === "raw" ? "大表导入中，请稍候…" : "处理中…")
          }
          watching={uploading}
        />

        {!uploading &&
        activeJob &&
        (activeJob.status === "PENDING" || activeJob.status === "PROCESSING") ? (
          <NotionButton type="button" variant="secondary" onClick={() => void watchImportProgress()}>
            刷新导入进度
          </NotionButton>
        ) : null}

        {interrupted &&
        !(
          activeJob &&
          (activeJob.status === "PENDING" || activeJob.status === "PROCESSING")
        ) ? (
          <ImportInterruptedNotice
            context={interrupted}
            verifyHref={xlvPath("/board")}
            verifyLabel="打开小绿盒看板核对"
            onDismiss={() => setInterrupted(null)}
          />
        ) : null}
        {error && (
          <NotionAlert tone="error">
            <p>{error}</p>
            {(error.includes("登录已过期") || error.includes("重新登录")) ? (
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

        <NotionButton
          onClick={handleImport}
          disabled={
            uploading ||
            !file ||
            (activeJob != null &&
              (activeJob.status === "PENDING" || activeJob.status === "PROCESSING"))
          }
        >
          {uploading ? "导入中…" : config.buttonLabel}
        </NotionButton>
      </NotionPanel>
    </PageShell>
  );
}
