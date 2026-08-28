"use client";

import { useCallback, useEffect, useState } from "react";
import { notion } from "@/components/ui/notion";
import {
  inferXlvImportFormat,
  type XlvImportFormat,
} from "@/services/import/xlv-import-summary";

type RecentJob = {
  id: string;
  fileName: string;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "PARTIAL";
  message: string | null;
  errorMessage: string | null;
  result: unknown;
  createdAt: string;
  completedAt: string | null;
};

const SLOTS: { format: XlvImportFormat; label: string }[] = [
  { format: "raw", label: "① 运营原始表" },
  { format: "roster", label: "② 组织名册" },
  { format: "assignment", label: "③ SN 归属" },
];

function latestByFormat(jobs: RecentJob[]) {
  const latest = new Map<XlvImportFormat, RecentJob>();
  for (const job of jobs) {
    const format = inferXlvImportFormat(job.fileName, job.result);
    if (!latest.has(format)) latest.set(format, job);
  }
  return latest;
}

function formatWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function verdict(job: RecentJob | undefined) {
  if (!job) {
    return {
      tone: "text-[#64748b]",
      title: "今天还没有导入记录",
      detail: "导入完成后会显示成功或失败",
    };
  }
  if (job.status === "PENDING" || job.status === "PROCESSING") {
    return {
      tone: "text-[#1d4ed8]",
      title: "正在导入",
      detail: job.fileName,
    };
  }
  if (job.status === "SUCCESS") {
    return {
      tone: "text-[#047857]",
      title: "已成功",
      detail:
        job.message && job.message !== "导入完成" ? job.message : job.fileName,
    };
  }
  if (job.status === "PARTIAL") {
    return {
      tone: "text-[#b45309]",
      title: "部分成功，请核对本页摘要",
      detail: job.errorMessage || job.message || job.fileName,
    };
  }
  return {
    tone: "text-[#b91c1c]",
    title: "未成功，请重新上传",
    detail: job.errorMessage || job.message || job.fileName,
  };
}

export function XlvRecentImportOutcomes({ refreshKey = 0 }: { refreshKey?: number }) {
  const [jobs, setJobs] = useState<RecentJob[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/import/jobs/recent?kind=xlv", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setJobs([]);
        return;
      }
      const data = (await res.json()) as { jobs?: RecentJob[] };
      setJobs(data.jobs ?? []);
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const latest = latestByFormat(jobs ?? []);

  return (
    <div className={`${notion.panel} p-4`}>
      <p className="text-sm font-semibold text-[#111827]">最近一次导入结果</p>
      <p className="mt-1 text-xs text-[#64748b]">
        运营只需看这一行：成功才能当已导入；中断或失败都要重传该文件。
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {SLOTS.map((slot) => {
          const job = latest.get(slot.format);
          const v = verdict(job);
          return (
            <li
              key={slot.format}
              className="rounded-[10px] border border-[#eef2f7] bg-[#f8fafc] px-3 py-2.5"
            >
              <p className="text-xs text-[#64748b]">{slot.label}</p>
              <p className={`mt-1 text-sm font-medium ${v.tone}`}>{v.title}</p>
              <p className="mt-0.5 truncate text-xs text-[#64748b]" title={v.detail}>
                {v.detail}
              </p>
              {job ? (
                <p className="mt-1 text-[11px] tabular-nums text-[#94a3b8]">
                  {formatWhen(job.completedAt ?? job.createdAt)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
