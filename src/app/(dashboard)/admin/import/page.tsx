"use client";

import { useState } from "react";

type ImportKind = "personnel" | "merchant";

interface MerchantImportResult {
  type?: string;
  status: string;
  totalRows: number;
  importedRows: number;
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
      "导入「支付宝作业人员名单.xlsx」。创建/更新区域经理与业务员（默认未开通），已开通账号不会被覆盖密码与认证状态。导入后请在组织管理 / 团队管理中开通账号。",
    endpoint: "/api/import/personnel",
    buttonLabel: "导入人员名单",
  },
  merchant: {
    title: "商户明细",
    description:
      "导入推广商家明细。按「作业编号」去重；同一商家 PID 可保留多条；优先按员工 id（个人 PID）匹配业务员。",
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
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const config = IMPORT_CONFIG[kind];

  function switchKind(next: ImportKind) {
    setKind(next);
    setFile(null);
    setResult(null);
    setError("");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "上传失败");
        return;
      }
      setResult(data);
      setFile(null);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Excel 数据上传</h1>
        <p className="text-sm text-gray-500 mt-1">仅管理员可操作。建议先导入人员名单，再导入商户明细。</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(Object.keys(IMPORT_CONFIG) as ImportKind[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => switchKind(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              kind === key
                ? "border-[#165DFF] text-[#165DFF]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {IMPORT_CONFIG[key].title}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 max-w-xl">
        <h2 className="text-sm font-medium text-gray-800 mb-2">{config.title}</h2>
        <p className="text-sm text-gray-500 mb-4">{config.description}</p>

        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="file"
            accept=".xlsx"
            key={kind}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#165DFF] file:text-white file:cursor-pointer"
          />

          <button
            type="submit"
            disabled={!file || loading}
            className="bg-[#165DFF] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#165DFF]/90 disabled:opacity-60"
          >
            {loading ? "导入中..." : config.buttonLabel}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {result && (
          <div className="mt-4 text-sm bg-green-50 text-green-800 px-4 py-3 rounded-lg space-y-1">
            <p>状态：{result.status}</p>
            {isPersonnelResult(result) ? (
              <>
                <p>经理处理：{result.managersCreated} 人</p>
                <p>业务员处理：{result.salesCreated} 人</p>
                <p>平台身份（PID）：{result.identitiesUpserted ?? "—"} 条</p>
                <p>团队：{result.teamsCreated} 个</p>
                <p className="text-xs text-green-700 pt-1">
                  新导入人员默认为「未开通」，请前往组织管理 / 团队管理开通账号。
                </p>
              </>
            ) : (
              <>
                <p>总行数：{result.totalRows}</p>
                <p>成功导入：{result.importedRows}</p>
                <p>跳过重复：{result.skippedRows}</p>
                <p>异常归档：{result.anomalyRows}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
