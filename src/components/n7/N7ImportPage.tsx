"use client";

import { useEffect, useRef, useState } from "react";
import { EnableSuccessModal } from "@/components/admin/EnableSuccessModal";
import {
  isImportRestartInterrupted,
  resumeImportJobPoll,
  uploadImportWithJobPoll,
  type ImportRestartContext,
} from "@/lib/import-upload-client";
import { ImportInterruptedNotice } from "@/components/import/ImportInterruptedNotice";
import { n7Path } from "@/lib/business-lines";
import { ENABLE_NEXT_STEPS } from "@/lib/account-lifecycle";
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

type PageTab = "personnel" | "n7" | "manager";

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
  "personnel" | "n7",
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
      "导入「支付宝N7作业人员名单.xlsx」。识别「N7作业名单」表（作业员姓名 + 所属经理）；若有「付呗作业员名单」会按姓名补齐 uid。队员导入后自动开通登录（仅 N7）。建议先导人员，再导 N7 考核表。",
    endpoint: "/api/import/personnel",
    buttonLabel: "导入人员名单",
  },
  n7: {
    title: "N7 考核表",
    description:
      "只上传运营加工表（如「7.15」），须含：设备SN、作业人员、所属经理、是否达标、考核开始/结束/剩余天数、有效天数与用户数等。不要上传「原始表格」。导入为全量同步：同 SN 覆盖更新，新 SN 新增，名单中消失的设备会自动删除。",
    endpoint: "/api/import/n7",
    buttonLabel: "导入 N7 考核表",
  },
};

const TAB_LABELS: Record<PageTab, string> = {
  personnel: "人员名单",
  n7: "N7 考核表",
  manager: "开经理账号",
};

function isPersonnelResult(result: ImportResult): result is PersonnelImportResult {
  return "managersCreated" in result;
}

export function N7ImportPage() {
  const [tab, setTab] = useState<PageTab>("personnel");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [interrupted, setInterrupted] = useState<ImportRestartContext | null>(null);
  const [managerName, setManagerName] = useState("");
  const [creatingManager, setCreatingManager] = useState(false);
  const [managerSuccess, setManagerSuccess] = useState<{
    name: string;
    username: string;
    password: string;
  } | null>(null);
  const uploadAbortRef = useRef(false);
  const resumeCheckedRef = useRef(false);

  useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;

    let cancelled = false;
    void (async () => {
      for (const endpoint of [
        IMPORT_CONFIG.personnel.endpoint,
        IMPORT_CONFIG.n7.endpoint,
      ]) {
        if (cancelled) return;
        try {
          const res = await resumeImportJobPoll<ImportResult>(
            endpoint,
            (value, label) => {
              if (!cancelled) {
                setLoading(true);
                setProgress(value);
                setProgressLabel(label);
              }
            }
          );
          if (cancelled || !res) {
            continue;
          }
          setTab(endpoint === IMPORT_CONFIG.n7.endpoint ? "n7" : "personnel");
          setResult(res);
          setError("");
          setInterrupted(null);
          return;
        } catch (err) {
          if (!cancelled) {
            if (isImportRestartInterrupted(err)) {
              setInterrupted(err.context);
            } else {
              setError(err instanceof Error ? err.message : "导入失败");
            }
          }
          return;
        } finally {
          if (!cancelled) {
            setLoading(false);
            setProgress(0);
            setProgressLabel("");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function switchTab(next: PageTab) {
    if (loading || creatingManager) return;
    setTab(next);
    setFile(null);
    setResult(null);
    setError("");
    setInterrupted(null);
    setProgress(0);
    setProgressLabel("");
    setManagerName("");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "manager" || !file || loading) return;

    const config = IMPORT_CONFIG[tab];
    setLoading(true);
    setError("");
    setInterrupted(null);
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
        if (isImportRestartInterrupted(err)) {
          setInterrupted(err.context);
        } else {
          setError(err instanceof Error ? err.message : "上传失败");
        }
        setProgress(0);
        setProgressLabel("");
      }
    } finally {
      if (!uploadAbortRef.current) {
        setLoading(false);
      }
    }
  }

  async function handleCreateManager(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreatingManager(true);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: managerName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "开号失败");
        return;
      }
      setManagerSuccess({
        name: data.user.name,
        username: data.user.username,
        password: data.user.password,
      });
      setManagerName("");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setCreatingManager(false);
    }
  }

  return (
    <PageShell>
      <EnableSuccessModal
        open={managerSuccess !== null}
        onClose={() => setManagerSuccess(null)}
        title="经理账号开通成功"
        name={managerSuccess?.name ?? ""}
        username={managerSuccess?.username ?? ""}
        password={managerSuccess?.password ?? ""}
        nextSteps={ENABLE_NEXT_STEPS.manager}
      />

      <PageHeader
        title="数据导入"
        kicker="支付宝 N7"
        meta={
          <p className="text-sm text-[#64748b]">
            建议先导入人员名单或开经理账号，再导入 N7 考核表，以便按姓名匹配作业人员与所属经理。
          </p>
        }
      />

      <NotionTabs
        tabs={(Object.keys(TAB_LABELS) as PageTab[]).map((key) => ({
          key,
          label: TAB_LABELS[key],
        }))}
        active={tab}
        onChange={switchTab}
      />

      {tab === "manager" ? (
        <NotionPanel className="max-w-xl space-y-4">
          <div>
            <h2 className="text-sm font-medium text-[#111827]">开经理账号</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              只填姓名即可开号：登录名自动拼音，初始密码 <strong>123456</strong>
              ，首次登录须改密。默认仅开通 <strong>N7</strong> 业务线。
            </p>
          </div>
          <form onSubmit={handleCreateManager} className="space-y-3">
            <NotionInput
              required
              placeholder="经理姓名"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              maxLength={20}
            />
            <NotionButton type="submit" disabled={creatingManager || !managerName.trim()}>
              {creatingManager ? "开号中…" : "开经理账号"}
            </NotionButton>
          </form>
          {error && <NotionAlert tone="error">{error}</NotionAlert>}
        </NotionPanel>
      ) : (
        <NotionPanel className="max-w-xl space-y-4">
          <div>
            <h2 className="text-sm font-medium text-[#111827]">
              {IMPORT_CONFIG[tab].title}
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              {IMPORT_CONFIG[tab].description}
            </p>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <input
              type="file"
              accept=".xlsx"
              key={tab}
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
              {loading ? "导入中…" : IMPORT_CONFIG[tab].buttonLabel}
            </NotionButton>
          </form>

          {interrupted ? (
            <ImportInterruptedNotice
              context={interrupted}
              verifyHref={n7Path("/board")}
              verifyLabel="打开 N7 看板核对"
              onDismiss={() => setInterrupted(null)}
            />
          ) : null}
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
      )}
    </PageShell>
  );
}
