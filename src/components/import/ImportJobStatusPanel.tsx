"use client";

import { NotionAlert, NotionProgressBar } from "@/components/ui/notion";
import {
  describeImportJobStatus,
  type ImportJobSnapshot,
} from "@/lib/import-upload-client";

type ImportJobStatusPanelProps = {
  job: ImportJobSnapshot | null;
  progress: number;
  progressLabel: string;
  watching: boolean;
};

export function ImportJobStatusPanel({
  job,
  progress,
  progressLabel,
  watching,
}: ImportJobStatusPanelProps) {
  const running =
    job != null && (job.status === "PENDING" || job.status === "PROCESSING");

  if (!watching && !running) return null;

  const verdict = job ? describeImportJobStatus(job) : null;

  return (
    <div className="space-y-2">
      {verdict ? (
        <NotionAlert tone={verdict.tone}>
          <p className="font-medium">{verdict.title}</p>
          <p className="mt-1 leading-relaxed">{verdict.body}</p>
        </NotionAlert>
      ) : null}
      {watching ? (
        <NotionProgressBar
          value={progress}
          label={progressLabel || "导入进行中…"}
        />
      ) : null}
    </div>
  );
}
