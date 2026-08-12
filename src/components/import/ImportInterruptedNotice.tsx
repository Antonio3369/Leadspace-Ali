"use client";

import Link from "next/link";
import { NotionAlert } from "@/components/ui/notion";
import type { ImportRestartContext } from "@/lib/import-upload-client";
import { formatImportRestartNotice } from "@/lib/import-upload-client";

type ImportInterruptedNoticeProps = {
  context?: ImportRestartContext;
  verifyHref: string;
  verifyLabel?: string;
  onDismiss?: () => void;
};

export function ImportInterruptedNotice({
  context,
  verifyHref,
  verifyLabel = "先打开看板核对数据",
  onDismiss,
}: ImportInterruptedNoticeProps) {
  const { title, body } = formatImportRestartNotice(context);

  return (
    <NotionAlert tone="warning">
      <p className="font-medium text-[#92400e]">{title}</p>
      <p className="mt-1.5 leading-relaxed">{body}</p>
      <p className="mt-2.5">
        <Link
          href={verifyHref}
          className="font-medium text-[#2563eb] hover:text-[#1d4ed8]"
        >
          {verifyLabel} →
        </Link>
      </p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2.5 text-xs text-[#64748b] hover:text-[#475569] underline underline-offset-2"
        >
          知道了，我已核对
        </button>
      ) : null}
    </NotionAlert>
  );
}
