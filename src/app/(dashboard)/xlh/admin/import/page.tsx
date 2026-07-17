"use client";

import { useEffect, useRef, useState } from "react";
import { formatRetentionLabel, getMerchantRetentionCutoff } from "@/lib/merchant-retention";
import {
  NotionAlert,
  NotionButton,
  NotionPanel,
  NotionProgressBar,
  NotionTabs,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";

type ImportKind = "personnel" | "merchant";

interface MerchantImportResult {
  type?: string;
  status: string;
  totalRows: number;
  importedRows: number;
  createdRows: number;
  updatedRows: number;
  prunedRows: number;
  skippedRows: number;
  anomalyRows: number;
}

interface PersonnelImportResult {
  type?: string;
  status: string;
  managersCreated: number;
  salesCreated: number;
  teamsCreated: number;
  identitiesUpserted?: number;
}

type ImportResult = MerchantImportResult | PersonnelImportResult;

/** 文件上传阶段占用 0–30%，服务端处理阶段占用 30–99%，完成时 100% */
const UPLOAD_PROGRESS_MAX = 30;
const PROCESSING_PROGRESS_MAX = 99;

const retentionLabel = formatRetentionLabel(getMerchantRetentionCutoff());

const IMPORT_CONFIG: Record<
  ImportKind,
  {
    title: string;
    description: string;
    endpoint: string;
    buttonLabel: string;
  }
> = {
  personnel: {
    title: "人员名单",
    description:
      "导入「支付宝作业人员名单.xlsx」。创建/更新区域经理与业务员（业务员为纯数据账号，不支持登录）。已开通的管理员账号不会被覆盖密码。",
    endpoint: "/api/import/personnel",
    buttonLabel: "导入人员名单",
  },
  merchant: {
    title: "商户明细",
    description: `导入推广商家明细。按「作业编号」新增或更新状态字段；归属团队/业务员仅在首次写入时确定。导入完成后自动清理 ${retentionLabel} 之外的旧数据。`,
    endpoint: "/api/import/excel",
    buttonLabel: "导入商户明细",
  },
};

function isPersonnelResult(result: ImportResult): result is PersonnelImportResult {
  return "managersCreated" in result;
}

function uploadWithProgress(
  endpoint: string,
  file: File,
  onProgress: (value: number, label: string) => void
): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    let processingTimer: ReturnType<typeof setInterval> | null = null;
    let processingStarted = false;

    function clearProcessingTimer() {
      if (processingTimer) {
        clearInterval(processingTimer);
        processingTimer = null;
      }
    }

    function startProcessingProgress() {
      if (processingStarted) return;
      processingStarted = true;
      let current = UPLOAD_PROGRESS_MAX;
      const startedAt = Date.now();
      onProgress(current, "正在解析并写入数据库…");
      processingTimer = setInterval(() => {
        if (current < PROCESSING_PROGRESS_MAX) {
          // 前期较快、接近完成时减速；99% 表示仍在等服务端收尾
          const step = current < 55 ? 2.5 : current < 80 ? 1.2 : current < 92 ? 0.4 : 0.15;
          current = Math.min(PROCESSING_PROGRESS_MAX, current + step);
        }
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        let label = "正在解析并写入数据库…";
        if (elapsedSec >= 90) {
          label = `即将完成…已用时 ${elapsedSec}s，请勿关闭页面`;
        } else if (elapsedSec >= 20) {
          label = `正在写入数据库…已用时 ${elapsedSec}s（大文件通常需 1–2 分钟）`;
        }
        onProgress(Math.round(current), label);
      }, 350);
    }

    xhr.upload.onprogress = (event) => {
      if (processingStarted) return;
      if (!event.lengthComputable) {
        onProgress(8, "正在上传文件…");
        return;
      }
      const ratio = event.total > 0 ? event.loaded / event.total : 0;
      const uploadPct = Math.max(1, Math.round(ratio * UPLOAD_PROGRESS_MAX));
      onProgress(uploadPct, `正在上传文件… ${Math.round(ratio * 100)}%`);
    };

    xhr.upload.onload = () => {
      startProcessingProgress();
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      clearProcessingTimer();

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          onProgress(100, "导入完成");
          resolve(JSON.parse(xhr.responseText) as ImportResult);
        } catch {
          reject(new Error("响应解析失败"));
        }
        return;
      }

      try {
        const data = JSON.parse(xhr.responseText) as { error?: string };
        reject(new Error(data.error ?? "上传失败"));
      } catch {
        reject(new Error(xhr.status === 0 ? "网络错误，请重试" : "上传失败"));
      }
    };

    xhr.onerror = () => {
      clearProcessingTimer();
      reject(new Error("网络错误，请重试"));
    };

    xhr.onabort = () => {
      clearProcessingTimer();
      reject(new Error("上传已取消"));
    };

    // 大文件写入可能超过 1 分钟；超时后给出明确错误，避免一直停在 99%
    xhr.timeout = 5 * 60 * 1000;
    xhr.ontimeout = () => {
      clearProcessingTimer();
      reject(new Error("导入超时（超过 5 分钟）。请确认数据库沙箱正常后重试。"));
    };

    xhr.open("POST", endpoint);
    xhr.send(formData);
  });
}

export default function ImportPage() {
  const [kind, setKind] = useState<ImportKind>("personnel");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const uploadAbortRef = useRef(false);

  const config = IMPORT_CONFIG[kind];

  useEffect(() => {
    return () => {
      uploadAbortRef.current = true;
    };
  }, []);

  function switchKind(next: ImportKind) {
    if (loading) return;
    setKind(next);
    setFile(null);
    setResult(null);
    setError("");
    setProgress(0);
    setProgressLabel("");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setError("");
    setResult(null);
    setProgress(0);
    setProgressLabel("准备上传…");
    uploadAbortRef.current = false;

    try {
      const data = await uploadWithProgress(config.endpoint, file, (value, label) => {
        if (!uploadAbortRef.current) {
          setProgress(value);
          setProgressLabel(label);
        }
      });
      if (uploadAbortRef.current) return;
      setResult(data);
      setFile(null);
    } catch (err) {
      if (!uploadAbortRef.current) {
        setError(err instanceof Error ? err.message : "上传失败");
        setProgress(0);
        setProgressLabel("");
      }
    } finally {
      if (!uploadAbortRef.current) {
        setLoading(false);
      }
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Excel 数据上传"
        kicker=""
        meta={<p>仅管理员可操作。建议先导入人员名单，再导入商户明细。</p>}
      />

      <NotionTabs
        tabs={(Object.keys(IMPORT_CONFIG) as ImportKind[]).map((key) => ({
          key,
          label: IMPORT_CONFIG[key].title,
        }))}
        active={kind}
        onChange={switchKind}
      />

      <NotionPanel className="max-w-xl">
        <h2 className="text-sm font-medium text-[#111827] mb-2">{config.title}</h2>
        <p className="text-sm text-[#64748b] mb-4">{config.description}</p>

        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="file"
            accept=".xlsx"
            key={kind}
            disabled={loading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[#64748b] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#2563eb] file:text-white file:cursor-pointer disabled:opacity-60"
          />

          {loading && (
            <NotionProgressBar value={progress} label={progressLabel} />
          )}

          <NotionButton type="submit" disabled={!file || loading}>
            {loading ? "导入中..." : config.buttonLabel}
          </NotionButton>
        </form>

        {error && (
          <div className="mt-4">
            <NotionAlert tone="error">{error}</NotionAlert>
          </div>
        )}

        {result && (
          <div className="mt-4">
            <NotionAlert tone="success">
              <p>状态：{result.status}</p>
              {isPersonnelResult(result) ? (
                <>
                  <p>经理处理：{result.managersCreated} 人</p>
                  <p>业务员处理：{result.salesCreated} 人</p>
                  <p>平台身份（PID）：{result.identitiesUpserted ?? "—"} 条</p>
                  <p>团队：{result.teamsCreated} 个</p>
                </>
              ) : (
                <>
                  <p>总行数：{result.totalRows}</p>
                  <p>成功处理：{result.importedRows}（新增 {result.createdRows}，更新 {result.updatedRows}）</p>
                  <p>自动清理：{result.prunedRows} 条</p>
                  <p>批次内重复：{result.skippedRows}</p>
                  <p>未匹配归档：{result.anomalyRows}</p>
                </>
              )}
            </NotionAlert>
          </div>
        )}
      </NotionPanel>
    </PageShell>
  );
}
