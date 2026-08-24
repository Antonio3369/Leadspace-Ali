"use client";

import Link from "next/link";
import { NotionAlert } from "@/components/ui/notion";
import type { ImportRestartContext } from "@/lib/import-upload-client";
import { formatImportRestartNotice } from "@/lib/import-upload-client";

type ImportInterruptedNoticeProps = {
  context?: ImportRestartContext;
  verifyHref?: string;
  verifyLabel?: string;
  onDismiss?: () => void;
};

export function ImportInterruptedNotice({
  context,
  verifyHref,
  verifyLabel = "打开看板",
  onDismiss,
}: ImportInterruptedNoticeProps) {
  const { title, body } = formatImportRestartNotice(context);

  return (
    <NotionAlert tone="error">
      <p className="font-medium">{title}</p>
      <p className="mt-1.5 leading-relaxed">{body}</p>
      {verifyHref ? (
        <p className="mt-2.5">
          <Link
            href={verifyHref}
            className="font-medium text-[#2563eb] hover:text-[#1d4ed8]"
          >
            {verifyLabel} →
          </Link>
        </p>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2.5 text-xs text-[#64748b] hover:text-[#475569] underline underline-offset-2"
        >
          关闭
        </button>
      ) : null}
    </NotionAlert>
  );
}
