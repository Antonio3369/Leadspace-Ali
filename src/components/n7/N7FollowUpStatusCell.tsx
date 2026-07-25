"use client";

import Link from "next/link";
import { n7Path } from "@/lib/business-lines";
import { N7FollowUpBadge } from "@/components/n7/N7FollowUpBadge";
import type { N7FollowUpPatchResult } from "@/lib/n7-follow-up-client";

export type { N7FollowUpPatchResult };

/** 列表行内：未处理时引导进详情 V1 关单；无望单用语为「已知悉」 */
export function N7FollowUpStatusCell({
  deviceSn,
  done,
  note,
  acknowledgeOnly = false,
}: {
  deviceSn: string;
  done: boolean;
  note?: string | null;
  /** 时间无望：按钮/角标用「已知悉」 */
  acknowledgeOnly?: boolean;
  onChanged?: (next: N7FollowUpPatchResult) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 items-end min-w-[4.5rem]">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {!(acknowledgeOnly && !done) ? (
          <N7FollowUpBadge
            done={done}
            note={note}
            acknowledgeOnly={acknowledgeOnly}
          />
        ) : null}
        {!done && (
          <Link
            href={n7Path(`/devices/${encodeURIComponent(deviceSn)}`)}
            onClick={(e) => e.stopPropagation()}
            className={
              acknowledgeOnly
                ? "rounded-md bg-[#fef2f2] px-2.5 py-1 text-sm font-semibold text-[#c41e3a] hover:bg-[#fee2e2] hover:text-[#9f1239] whitespace-nowrap"
                : "rounded-md bg-[#eff6ff] px-2.5 py-1 text-sm font-semibold text-[#2563eb] hover:bg-[#dbeafe] hover:text-[#1d4ed8] whitespace-nowrap"
            }
          >
            {acknowledgeOnly ? "已知悉" : "去关单"}
          </Link>
        )}
      </div>
    </div>
  );
}
