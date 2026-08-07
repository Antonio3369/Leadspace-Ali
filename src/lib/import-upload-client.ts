/** 上传大表：支持同步结果或 202 + jobId 轮询 */

export async function uploadImportWithJobPoll<T>(
  endpoint: string,
  file: File,
  onProgress: (value: number, label: string) => void
): Promise<T> {
  onProgress(5, "正在上传文件…");

  const formData = new FormData();
  formData.append("file", file);

  const uploadRes = await fetch(endpoint, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });

  const uploadJson = (await uploadRes.json().catch(() => ({}))) as {
    error?: string;
    async?: boolean;
    jobId?: string;
  } & T;

  if (!uploadRes.ok) {
    if (uploadRes.status === 401) {
      throw new Error("登录已过期，请重新登录后再导入");
    }
    throw new Error(uploadJson.error || "上传失败");
  }

  // 兼容旧同步响应
  if (!uploadJson.async || !uploadJson.jobId) {
    onProgress(100, "导入完成");
    return uploadJson as T;
  }

  const jobId = uploadJson.jobId;
  onProgress(20, "文件已上传，后台导入中…");

  const startedAt = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

    const res = await fetch(`/api/import/jobs/${encodeURIComponent(jobId)}`, {
      credentials: "same-origin",
    });
    const job = (await res.json()) as {
      error?: string;
      status?: string;
      progress?: number;
      message?: string | null;
      errorMessage?: string | null;
      result?: T;
    };

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("登录已过期，请重新登录后再导入");
      }
      throw new Error(job.error || "查询导入进度失败");
    }

    const progress = Math.min(99, Math.max(20, job.progress ?? 20));
    const label =
      job.message ||
      (elapsedSec >= 20
        ? `后台导入中…已用时 ${elapsedSec}s`
        : "后台导入中…");
    onProgress(progress, label);

    if (job.status === "SUCCESS") {
      onProgress(100, "导入完成");
      return (job.result ?? {}) as T;
    }
    if (job.status === "FAILED" || job.status === "PARTIAL") {
      if (job.status === "PARTIAL" && job.result) {
        onProgress(100, "导入完成（部分成功）");
        return job.result as T;
      }
      throw new Error(job.errorMessage || "导入失败");
    }
    if (elapsedSec > 15 * 60) {
      throw new Error("导入等待超过 15 分钟，请刷新后查看数据或重试。");
    }
  }
}
