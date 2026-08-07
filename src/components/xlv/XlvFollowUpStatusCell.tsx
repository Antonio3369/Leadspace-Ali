"use client";

import Link from "next/link";
import { xlvPath } from "@/lib/business-lines";

export function XlvFollowUpStatusCell({
  deviceSn,
  done,
}: {
  deviceSn: string;
  done: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 items-end min-w-[4.5rem]">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
            done
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-amber-50 text-amber-900 border-amber-200"
          }`}
        >
          {done ? "已回访" : "待回访"}
        </span>
        {!done && (
          <Link
            href={xlvPath(`/devices/${encodeURIComponent(deviceSn)}`)}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md bg-[#eff6ff] px-2.5 py-1 text-sm font-semibold text-[#2563eb] hover:bg-[#dbeafe] hover:text-[#1d4ed8] whitespace-nowrap"
          >
            去跟进
          </Link>
        )}
      </div>
    </div>
  );
}
