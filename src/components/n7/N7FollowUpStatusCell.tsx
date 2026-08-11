"use client";

import Link from "next/link";
import { n7Path } from "@/lib/business-lines";
import type { N7FollowUpPatchResult } from "@/lib/n7-follow-up-client";

export type { N7FollowUpPatchResult };

/** 列表行内：未处理时引导进详情 V1 关单；无望单用语为「已知悉」 */
export function N7FollowUpStatusCell({
  deviceSn,
  done,
  acknowledgeOnly = false,
  suppressDetailLink = false,
}: {
  deviceSn: string;
  done: boolean;
  note?: string | null;
  /** 时间无望：按钮/角标用「已知悉」 */
  acknowledgeOnly?: boolean;
  suppressDetailLink?: boolean;
  onChanged?: (next: N7FollowUpPatchResult) => void;
}) {
  const actionClassName = acknowledgeOnly
    ? "rounded-md bg-[#fef2f2] px-2.5 py-1 text-sm font-semibold text-[#c41e3a] whitespace-nowrap"
    : "rounded-md bg-[#eff6ff] px-2.5 py-1 text-sm font-semibold text-[#2563eb] whitespace-nowrap";

  const statusLabel =
    acknowledgeOnly && done ? "已知悉" : done ? "已处理" : "待处理";

  return (
    <div className="flex w-full flex-col items-center gap-2 min-w-[4.75rem]">
      <span
        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
          done
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-amber-50 text-amber-900 border-amber-200"
        }`}
      >
        {statusLabel}
      </span>
      {!done && !suppressDetailLink ? (
        <Link
          href={n7Path(`/devices/${encodeURIComponent(deviceSn)}`)}
          onClick={(e) => e.stopPropagation()}
          className={`${actionClassName} hover:opacity-90`}
        >
          {acknowledgeOnly ? "已知悉" : "去关单"}
        </Link>
      ) : !done && suppressDetailLink ? (
        <span className={actionClassName}>
          {acknowledgeOnly ? "已知悉" : "去关单"}
        </span>
      ) : null}
    </div>
  );
}
