"use client";

import Link from "next/link";
import { xlvPath } from "@/lib/business-lines";

export function XlvFollowUpStatusCell({
  deviceSn,
  done,
  suppressDetailLink = false,
}: {
  deviceSn: string;
  done: boolean;
  /** 整行已链到详情时，避免嵌套 <a> */
  suppressDetailLink?: boolean;
}) {
  const actionClassName =
    "rounded-md bg-[#eff6ff] px-2.5 py-1 text-sm font-semibold text-[#2563eb] whitespace-nowrap";

  return (
    <div className="flex w-full flex-col items-center gap-2 min-w-[4.75rem]">
      <span
        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
          done
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-amber-50 text-amber-900 border-amber-200"
        }`}
      >
        {done ? "已回访" : "待回访"}
      </span>
      {!done && !suppressDetailLink ? (
        <Link
          href={xlvPath(`/devices/${encodeURIComponent(deviceSn)}`)}
          onClick={(e) => e.stopPropagation()}
          className={`${actionClassName} hover:bg-[#dbeafe] hover:text-[#1d4ed8]`}
        >
          去关单
        </Link>
      ) : !done && suppressDetailLink ? (
        <span className={actionClassName}>去关单</span>
      ) : null}
    </div>
  );
}
