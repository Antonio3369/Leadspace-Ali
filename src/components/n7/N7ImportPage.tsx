"use client";

import { useRef, useState } from "react";
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

type ImportKind = "personnel" | "n7";

interface N7ImportResult {
  status: string;
  totalRows: number;
  importedRows: number;
  createdRows: number;
  updatedRows: number;
  deletedRows?: number;
  skippedRows: number;
  anomalyRows: number;
  sheetName?: string;
  errors?: string[];
}

interface PersonnelImportResult {
  type?: string;
  status: string;
  managersCreated: number;
  salesCreated: number;
  teamsCreated: number;
  identitiesUpserted?: number;
}

type ImportResult = N7ImportResult | PersonnelImportResult;

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
      "导入「支付宝N7作业人员名单.xlsx」。识别「N7作业名单」表（作业员姓名 + 所属经理）；若有「付呗作业员名单」会按姓名补齐 uid。业务员为纯数据账号。建议先导人员，再导 N7 考核表。大表在后台导入，上传完成后可等待进度，不影响他人看数。",
    endpoint: "/api/import/personnel",
    buttonLabel: "导入人员名单",
  },
  n7: {
    title: "N7 考核表",
    description:
      "只上传运营加工表（如「7.15」），须含：设备SN、作业人员、所属经理、是否达标、考核开始/结束/剩余天数、有效天数与用户数等。不要上传「原始表格」。导入为全量同步：同 SN 覆盖更新，新 SN 新增，名单中消失的设备会自动删除。大表在后台导入。",
    endpoint: "/api/import/n7",
    buttonLabel: "导入 N7 考核表",
  },
};

function isPersonnelResult(result: ImportResult): result is PersonnelImportResult {
  return "managersCreated" in result;
}

export function N7ImportPage() {
  const [kind, setKind] = useState<ImportKind>("personnel");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const uploadAbortRef = useRef(false);

  const config = IMPORT_CONFIG[kind];

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
        title="数据导入"
        kicker="支付宝 N7"
        meta={
          <p className="text-sm text-[#64748b]">
            建议先导入人员名单，再导入 N7 考核表，以便按姓名匹配作业人员与所属经理。
          </p>
        }
      />

      <NotionTabs
        tabs={(Object.keys(IMPORT_CONFIG) as ImportKind[]).map((key) => ({
          key,
          label: IMPORT_CONFIG[key].title,
        }))}
        active={kind}
        onChange={switchKind}
      />

      <NotionPanel className="max-w-xl space-y-4">
        <div>
          <h2 className="text-sm font-medium text-[#111827]">{config.title}</h2>
          <p className="mt-1 text-sm text-[#64748b]">{config.description}</p>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="file"
            accept=".xlsx"
            key={kind}
            disabled={loading}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError("");
            }}
            className="block w-full text-sm text-[#64748b] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#2563eb] file:text-white file:cursor-pointer disabled:opacity-60"
          />

          {loading && (
            <NotionProgressBar value={progress} label={progressLabel || "处理中…"} />
          )}

          <NotionButton type="submit" disabled={!file || loading}>
            {loading ? "导入中…" : config.buttonLabel}
          </NotionButton>
        </form>

        {error && <NotionAlert tone="error">{error}</NotionAlert>}

        {result && (
          <NotionAlert
            tone={
              !isPersonnelResult(result) && result.status === "FAILED"
                ? "error"
                : "success"
            }
          >
            {isPersonnelResult(result) ? (
              <>
                <p>状态：{result.status}</p>
                <p>经理处理：{result.managersCreated} 人</p>
                <p>业务员处理：{result.salesCreated} 人</p>
                <p>平台身份（PID）：{result.identitiesUpserted ?? "—"} 条</p>
                <p>团队：{result.teamsCreated} 个</p>
              </>
            ) : (
              <>
                <p>
                  {result.status}：
                  {result.sheetName ? `表「${result.sheetName}」` : ""}共{" "}
                  {result.totalRows} 行，写入 {result.importedRows}
                  （新增 {result.createdRows} / 更新 {result.updatedRows}
                  {typeof result.deletedRows === "number"
                    ? ` / 清理 ${result.deletedRows}`
                    : ""}
                  ），跳过 {result.skippedRows}，异常 {result.anomalyRows}
                </p>
                {result.errors && result.errors.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-xs space-y-0.5">
                    {result.errors.slice(0, 8).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </NotionAlert>
        )}
      </NotionPanel>
    </PageShell>
  );
}
