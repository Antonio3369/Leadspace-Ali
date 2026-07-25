"use client";

import Link from "next/link";
import { n7Path } from "@/lib/business-lines";
import type { N7Priority } from "@/lib/n7-rules";
import {
  isN7TimeHopeless,
  N7_QUALIFY_DAYS,
  N7_QUALIFY_USERS,
} from "@/lib/n7-rules";
import { N7PriorityBadge } from "@/components/n7/N7PriorityBadge";
import {
  N7FollowUpStatusCell,
  type N7FollowUpPatchResult,
} from "@/components/n7/N7FollowUpStatusCell";

export type N7DeviceCardRow = {
  id: string;
  deviceSn: string;
  storeName: string | null;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
  effectiveUsers: number;
  isQualified: boolean;
  priority: N7Priority | null;
  daysGap: number;
  usersGap: number;
  /** 时间上已无望；未传则按规则现场计算 */
  hopeless?: boolean;
  operatorName?: string;
  managerName?: string;
  salesUserId?: string | null;
  managerUserId?: string | null;
  followUpDone: boolean;
  followUpNote: string | null;
  notLit?: boolean;
  notSubscribed?: boolean;
  notCheckedIn?: boolean;
};

function managerKeyOf(d: N7DeviceCardRow) {
  return d.managerUserId ?? `name:${d.managerName ?? ""}`;
}

function staffKeyOf(d: N7DeviceCardRow) {
  return d.salesUserId ?? `name:${d.operatorName ?? ""}`;
}

function remainingLabel(d: N7DeviceCardRow) {
  if (d.remainingEnded) return "考核已结束";
  if (d.remainingDays == null) return "剩余天数未知";
  return `考核还剩 ${d.remainingDays} 天`;
}

function isHopeless(d: N7DeviceCardRow): boolean {
  if (typeof d.hopeless === "boolean") return d.hopeless;
  return isN7TimeHopeless(d);
}

/** 相对达标线（有效天≥3、用户≥3）的进度与缺口 */
function progressParts(
  d: N7DeviceCardRow,
  variant: "followUp" | "expired"
) {
  const dayCur = d.effectiveDays;
  const userCur = d.effectiveUsers;
  const dayNeed = Math.max(0, d.daysGap);
  const userNeed = Math.max(0, d.usersGap);
  const progress = `有效天 ${dayCur}/${N7_QUALIFY_DAYS} · 用户 ${userCur}/${N7_QUALIFY_USERS}`;

  if (d.isQualified || (dayNeed === 0 && userNeed === 0)) {
    return {
      progress,
      gap: "已达达标线",
      detail: null as string | null,
      done: true as const,
      hopeless: false as const,
    };
  }

  const gapBits: string[] = [];
  if (dayNeed > 0) gapBits.push(`${dayNeed}天`);
  if (userNeed > 0) gapBits.push(`${userNeed}人`);

  // 过期名单：历史缺口，不用「距达标仅剩」（易与待跟进混淆）
  if (variant === "expired" || d.remainingEnded) {
    return {
      progress,
      gap: gapBits.length > 0 ? `期末缺口 ${gapBits.join("·")}` : "期末未达标",
      detail: null as string | null,
      done: false as const,
      hopeless: false as const,
    };
  }

  const remainGap = `距达标仅剩 ${gapBits.join("·")}`;

  if (isHopeless(d)) {
    return {
      progress,
      gap: remainGap,
      detail: null as string | null,
      done: false as const,
      hopeless: true as const,
    };
  }

  return {
    progress,
    gap: remainGap,
    detail: null as string | null,
    done: false as const,
    hopeless: false as const,
  };
}

function BehaviorTags({ d }: { d: N7DeviceCardRow }) {
  const tags: string[] = [];
  if (d.notLit) tags.push("未点亮");
  if (d.notSubscribed) tags.push("未订阅");
  if (d.notCheckedIn) tags.push("未打卡");
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded bg-red-50 px-1.5 py-0.5 text-[0.7rem] text-red-700"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** 手机友好的设备卡片列表（今日待办 / 达标跟进 / 过期复盘共用） */
export function N7DeviceCardList({
  devices,
  showManager,
  showOperator = true,
  rangeQs,
  emptyText = "暂无设备",
  showBehavior = false,
  /** expired：复盘名单，文案与角标区别于待跟进 */
  variant = "followUp",
  moreHref,
  moreLabel,
  onFollowUpChanged,
}: {
  devices: N7DeviceCardRow[];
  showManager: boolean;
  /** 队员设备页已在该人下时可关 */
  showOperator?: boolean;
  rangeQs: string;
  emptyText?: string;
  showBehavior?: boolean;
  variant?: "followUp" | "expired";
  moreHref?: string;
  moreLabel?: string;
  onFollowUpChanged?: (
    deviceSn: string,
    next: N7FollowUpPatchResult
  ) => void;
}) {
  const isExpired = variant === "expired";
  return (
    <div
      className={`rounded-[14px] border bg-white shadow-sm overflow-hidden ${
        isExpired ? "border-[#fecaca]" : "border-[#eef2f7]"
      }`}
    >
      {devices.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[#94a3b8]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[#f1f5f9]">
          {devices.map((d) => {
            const treatExpired =
              isExpired || (Boolean(d.remainingEnded) && !d.isQualified);
            const progress = progressParts(
              d,
              treatExpired ? "expired" : "followUp"
            );
            const staffTab = treatExpired ? "expired" : "followUp";
            return (
            <li
              key={d.id}
              data-list-anchor={d.deviceSn}
              className="px-3.5 py-3 hover:bg-[#f8fafc]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {treatExpired ? (
                      <span className="inline-flex rounded-md bg-[#fef2f2] px-1.5 py-0.5 text-xs font-semibold text-[#c41e3a]">
                        过期未达标
                      </span>
                    ) : d.isQualified ? null : (
                      <N7PriorityBadge p={d.priority} />
                    )}
                    <span className="text-xs tabular-nums text-[#64748b]">
                      {remainingLabel(d)}
                    </span>
                  </div>

                  <Link
                    href={n7Path(`/devices/${encodeURIComponent(d.deviceSn)}`)}
                    className="block text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8] truncate"
                  >
                    {d.storeName || "未命名门店"}
                  </Link>

                  <div className="text-xs leading-snug text-left space-y-0.5">
                    <p className="tabular-nums text-[#334155]">
                      {progress.progress}
                    </p>
                    {progress.done ? null : progress.hopeless ? (
                      <p className="text-[#94a3b8]">{progress.gap}</p>
                    ) : (
                      <p
                        className={
                          treatExpired ? "text-[#64748b]" : "text-[#c41e3a]"
                        }
                      >
                        {progress.gap}
                      </p>
                    )}
                  </div>

                  {showOperator && d.operatorName ? (
                  <p className="text-xs text-[#94a3b8] truncate">
                    <Link
                      href={`${n7Path(
                        `/managers/${encodeURIComponent(managerKeyOf(d))}/staff/${encodeURIComponent(staffKeyOf(d))}`
                      )}?${rangeQs}&tab=${staffTab}`}
                      className="text-[#2563eb] hover:text-[#1d4ed8]"
                    >
                      {d.operatorName}
                    </Link>
                    {showManager && d.managerName ? (
                      <>
                        <span className="mx-1 text-[#cbd5e1]">·</span>
                        <Link
                          href={`${n7Path(
                            `/managers/${encodeURIComponent(managerKeyOf(d))}`
                          )}?${rangeQs}`}
                          className="text-[#2563eb] hover:text-[#1d4ed8]"
                        >
                          {d.managerName}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  ) : null}

                  {showBehavior ? <BehaviorTags d={d} /> : null}
                </div>

                <div className="shrink-0 flex flex-col items-end justify-center gap-2 min-w-[4.75rem]">
                  {d.isQualified || progress.done ? (
                    <p className="text-right text-base font-semibold leading-tight text-emerald-700">
                      已达标
                    </p>
                  ) : treatExpired ? null : progress.hopeless ? (
                    <p className="text-right text-sm font-semibold leading-tight text-[#c41e3a]">
                      已无望
                      <span className="block text-[0.7rem] font-medium opacity-90">
                        时间不够
                      </span>
                    </p>
                  ) : null}
                  {/* 已达标无需再标处理 / 知悉 */}
                  {d.isQualified || progress.done ? null : (
                    <N7FollowUpStatusCell
                      deviceSn={d.deviceSn}
                      done={Boolean(d.followUpDone)}
                      note={d.followUpNote}
                      acknowledgeOnly={treatExpired || progress.hopeless}
                      onChanged={(next) =>
                        onFollowUpChanged?.(d.deviceSn, next)
                      }
                    />
                  )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {moreHref && moreLabel ? (
        <div className="border-t border-[#eef2f7] bg-[#fafbfc]">
          <Link
            href={moreHref}
            className="flex items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-[#2563eb] hover:bg-[#f1f5f9] hover:text-[#1d4ed8] transition-colors"
          >
            {moreLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
