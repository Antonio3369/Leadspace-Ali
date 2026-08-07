"use client";

import type { XlvImportSummary } from "@/services/import/xlv-import-summary";

export function XlvImportSummaryPanel({ summary }: { summary: XlvImportSummary }) {
  const missingColumns = summary.columns.filter((col) => !col.matched);
  const matchedColumns = summary.columns.filter((col) => col.matched);

  return (
    <div className="rounded-[12px] border border-[#eef2f7] bg-[#f8fafc] px-4 py-3 text-sm space-y-3">
      <div>
        <p className="font-semibold text-[#111827]">导入摘要</p>
        <p className="text-xs text-[#94a3b8] mt-0.5">
          工作表 {summary.sheetName} ·{" "}
          {summary.format === "raw" ? "运营原始表" : "人员归属表"}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Stat label="文件行数" value={summary.rawRowsInFile} />
        <Stat label="设备 SN" value={summary.uniqueDevices} />
        <Stat label="新建设备" value={summary.devicesCreated} />
        <Stat label="更新设备" value={summary.devicesUpdated} />
        {summary.format === "raw" ? (
          <>
            <Stat label="写入快照" value={summary.snapshotsWritten} />
            <Stat label="新建快照" value={summary.snapshotsCreated} />
            <Stat label="更新快照" value={summary.snapshotsUpdated} />
            <Stat label="合并重复行" value={summary.fileDuplicateRowsCollapsed} />
            <Stat label="清理库内重复" value={summary.duplicateSnapshotsRemoved} />
          </>
        ) : null}
      </div>

      {summary.statDateRange ? (
        <p className="text-xs text-[#64748b]">
          统计日期范围：{summary.statDateRange.min} ~ {summary.statDateRange.max}
        </p>
      ) : null}

      {matchedColumns.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-[#334155] mb-1">已识别列</p>
          <ul className="text-xs text-[#64748b] space-y-0.5">
            {matchedColumns.map((col) => (
              <li key={col.id}>
                <span className="text-emerald-700">✓</span> {col.label}
                {col.matchedHeader && col.matchedHeader !== col.label ? (
                  <span className="text-[#94a3b8]">（{col.matchedHeader}）</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingColumns.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-amber-800 mb-1">未识别列</p>
          <ul className="text-xs text-amber-800 space-y-0.5">
            {missingColumns.map((col) => (
              <li key={col.id}>✗ {col.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.format === "personnel" &&
      (summary.unmatchedManagers.length > 0 ||
        summary.unmatchedOperators.length > 0) ? (
        <div className="text-xs space-y-1">
          <p className="font-medium text-[#334155]">系统未匹配姓名</p>
          {summary.unmatchedManagers.length > 0 ? (
            <p className="text-[#64748b]">
              经理（{summary.unmatchedManagers.length}）：{" "}
              {summary.unmatchedManagers.slice(0, 8).join("、")}
              {summary.unmatchedManagers.length > 8 ? "…" : ""}
            </p>
          ) : null}
          {summary.unmatchedOperators.length > 0 ? (
            <p className="text-[#64748b]">
              作业员（{summary.unmatchedOperators.length}）：{" "}
              {summary.unmatchedOperators.slice(0, 8).join("、")}
              {summary.unmatchedOperators.length > 8 ? "…" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {summary.warnings.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-amber-800 mb-1">提示</p>
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc pl-4">
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#eef2f7] bg-white px-2.5 py-2">
      <p className="text-[#94a3b8]">{label}</p>
      <p className="text-base font-semibold tabular-nums text-[#111827]">{value}</p>
    </div>
  );
}
