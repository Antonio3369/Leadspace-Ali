"use client";

import Link from "next/link";
import { xlvPath } from "@/lib/business-lines";
import { XLV_ALERT_LABELS, xlvMerchantLabel, type XlvAlertKind, type XlvQualificationStatus } from "@/lib/xlv-rules";
import type { XlvDeviceListItem } from "@/services/xlv/analytics";
import { XlvQualificationBadge } from "@/components/xlv/XlvQualificationBadge";
import { XlvFollowUpStatusCell } from "@/components/xlv/XlvFollowUpStatusCell";

function alertBadgeClass(kind: XlvDeviceListItem["alertKind"]) {
  if (kind === "single_silence") {
    return "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]";
  }
  if (kind === "dormant") {
    return "bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]";
  }
  return "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]";
}

function progressLine(d: XlvDeviceListItem) {
  return `累计用户 ${d.cumulativeUsers} · 笔数 ${d.cumulativeTxns}`;
}

function gapLine(d: XlvDeviceListItem) {
  if (d.alertKind === "single_silence") {
    return `仅 1 笔 · 已沉睡 ${d.sleepDays} 天`;
  }
  if (d.alertKind === "dormant") {
    return `沉睡 ${d.sleepDays} 天`;
  }
  return null;
}

function rightLabel(d: XlvDeviceListItem) {
  if (d.alertKind === "single_silence") {
    return { title: "单笔沉默", sub: `${d.sleepDays} 天未用` };
  }
  if (d.alertKind === "dormant") {
    return { title: `${d.sleepDays} 天`, sub: "未收款" };
  }
  return { title: "正常", sub: d.sleepDays === 0 ? "今日有动" : `${d.sleepDays} 天` };
}

export type XlvDashboardShortcutFilter =
  | Exclude<XlvAlertKind, "all">
  | XlvQualificationStatus;

function isAlertShortcut(
  filter: XlvDashboardShortcutFilter
): filter is Exclude<XlvAlertKind, "all"> {
  return filter === "single_silence" || filter === "dormant" || filter === "active";
}

/** 对齐 N7 设备卡片：商户名 + 指标进度 + 归属人 */
export function XlvDeviceCardList({
  devices,
  showManager,
  emptyText = "暂无设备",
  onPickOperator,
  onPickManager,
  linkToDetail = false,
  showQualification = true,
  /** 顶部快捷筛选已选中时，列表内不再重复同类徽章 */
  activeShortcut,
  showFollowUpStatus = false,
}: {
  devices: XlvDeviceListItem[];
  showManager: boolean;
  emptyText?: string;
  onPickOperator?: (name: string) => void;
  onPickManager?: (name: string) => void;
  linkToDetail?: boolean;
  showQualification?: boolean;
  activeShortcut?: XlvDashboardShortcutFilter | null;
  showFollowUpStatus?: boolean;
}) {
  const hideAlertBadge = Boolean(activeShortcut && isAlertShortcut(activeShortcut));
  const hideQualificationBadge = Boolean(
    activeShortcut && !isAlertShortcut(activeShortcut)
  );
  const borderTone = devices.some((d) => d.alertKind === "single_silence")
    ? "border-[#fecaca]"
    : devices.some((d) => d.alertKind === "dormant")
      ? "border-amber-100"
      : "border-[#eef2f7]";

  return (
    <div
      className={`rounded-[14px] border bg-white shadow-sm overflow-hidden ${borderTone}`}
    >
      {devices.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[#94a3b8]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[#f1f5f9]">
          {devices.map((d) => {
            const merchant = xlvMerchantLabel(d);
            const right = rightLabel(d);
            const gap = gapLine(d);
            return (
              <li
                key={d.deviceSn}
                data-list-anchor={d.deviceSn}
                className="px-3.5 py-3 hover:bg-[#f8fafc]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                      {!hideAlertBadge ? (
                        <span
                          className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-semibold ${alertBadgeClass(d.alertKind)}`}
                        >
                          {XLV_ALERT_LABELS[d.alertKind]}
                        </span>
                      ) : null}
                      {showQualification &&
                      !hideQualificationBadge &&
                      d.qualificationStatus ? (
                        <XlvQualificationBadge
                          status={d.qualificationStatus}
                          compact
                        />
                      ) : null}
                      {d.firstTxnDate || d.lastTxnDate ? (
                        <div className="text-xs tabular-nums text-[#64748b] leading-snug">
                          {d.firstTxnDate ? <p>首笔 {d.firstTxnDate}</p> : null}
                          {d.lastTxnDate ? <p>末笔 {d.lastTxnDate}</p> : null}
                        </div>
                      ) : null}
                    </div>

                    {linkToDetail ? (
                      <Link
                        href={xlvPath(`/devices/${encodeURIComponent(d.deviceSn)}`)}
                        className="block text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8] truncate"
                      >
                        {merchant}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-[#111827] truncate">
                        {merchant}
                      </p>
                    )}
                    <p className="text-[0.7rem] text-[#94a3b8] font-mono truncate">
                      {d.deviceSn}
                    </p>

                    <div className="text-xs leading-snug space-y-0.5">
                      <p className="tabular-nums text-[#334155]">{progressLine(d)}</p>
                      {d.qualificationGapLine &&
                      showQualification &&
                      !hideQualificationBadge ? (
                        <p
                          className={
                            d.qualificationStatus === "qualified"
                              ? "text-emerald-700"
                              : d.qualificationStatus === "invalid"
                                ? "text-slate-500"
                                : "text-sky-700"
                          }
                        >
                          考核：{d.qualificationGapLine}
                        </p>
                      ) : null}
                      {gap ? (
                        <p
                          className={
                            d.alertKind === "active"
                              ? "text-[#64748b]"
                              : "text-[#c41e3a]"
                          }
                        >
                          {gap}
                        </p>
                      ) : null}
                      {"todayReason" in d && (d as { todayReason?: string }).todayReason ? (
                        <p className="text-amber-800 font-medium">
                          {(d as { todayReason: string }).todayReason}
                        </p>
                      ) : null}
                    </div>

                    {d.operatorName || (showManager && d.managerName) ? (
                      <p className="text-xs text-[#94a3b8] truncate">
                        {d.operatorName ? (
                          onPickOperator ? (
                            <button
                              type="button"
                              onClick={() => onPickOperator(d.operatorName)}
                              className="text-[#2563eb] hover:text-[#1d4ed8]"
                            >
                              {d.operatorName}
                            </button>
                          ) : (
                            d.operatorName
                          )
                        ) : null}
                        {showManager && d.managerName ? (
                          <>
                            {d.operatorName ? (
                              <span className="mx-1 text-[#cbd5e1]">·</span>
                            ) : null}
                            {onPickManager ? (
                              <button
                                type="button"
                                onClick={() => onPickManager(d.managerName)}
                                className="text-[#2563eb] hover:text-[#1d4ed8]"
                              >
                                {d.managerName}
                              </button>
                            ) : (
                              d.managerName
                            )}
                          </>
                        ) : null}
                        {d.companyName ? (
                          <>
                            <span className="mx-1 text-[#cbd5e1]">·</span>
                            <span>{d.companyName}</span>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right min-w-[4.5rem]">
                    {showFollowUpStatus && "followUpDone" in d ? (
                      <XlvFollowUpStatusCell
                        deviceSn={d.deviceSn}
                        done={Boolean((d as XlvDeviceListItem & { followUpDone?: boolean }).followUpDone)}
                      />
                    ) : (
                      <>
                        <p
                          className={`text-base font-semibold leading-tight ${
                            d.alertKind === "active"
                              ? "text-emerald-700"
                              : "text-[#c41e3a]"
                          }`}
                        >
                          {right.title}
                        </p>
                        <p className="text-[0.7rem] text-[#94a3b8] mt-0.5">{right.sub}</p>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
