"use client";

import { useEffect, useRef, useState } from "react";
import { formatRetentionLabel, getMerchantRetentionCutoff } from "@/lib/merchant-retention";
import { uploadImportWithJobPoll } from "@/lib/import-upload-client";
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
      "导入「支付宝作业人员名单.xlsx」。创建/更新区域经理与业务员（业务员为纯数据账号，不支持登录）。已开通的管理员账号不会被覆盖密码。大表在后台导入，不影响他人看数。",
    endpoint: "/api/import/personnel",
    buttonLabel: "导入人员名单",
  },
  merchant: {
    title: "商户明细",
    description: `导入推广商家明细。按「作业编号」新增或更新状态字段；归属团队/业务员仅在首次写入时确定。导入完成后自动清理 ${retentionLabel} 之外的旧数据。大表在后台导入。`,
    endpoint: "/api/import/excel",
    buttonLabel: "导入商户明细",
  },
};

function isPersonnelResult(result: ImportResult): result is PersonnelImportResult {
  return "managersCreated" in result;
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
      const data = await uploadImportWithJobPoll<ImportResult>(
        config.endpoint,
        file,
        (value, label) => {
          if (!uploadAbortRef.current) {
            setProgress(value);
            setProgressLabel(label);
          }
        }
      );
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
