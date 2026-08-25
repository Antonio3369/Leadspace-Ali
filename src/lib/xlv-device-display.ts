import {
  XLV_QUALIFICATION_LABELS,
  type XlvDeviceAlertKind,
  type XlvQualificationStatus,
  xlvEffectiveAlertKind,
} from "@/lib/xlv-rules";

/** 移机后：末笔早于考核起算 = 仍是旧店交易，新店卡片不展示 */
export function xlvIsLegacyTxnBeforeRelocation(opts: {
  relocated: boolean;
  assessmentStart: string | null | undefined;
  lastTxnDate: string | null | undefined;
}): boolean {
  if (!opts.relocated || !opts.assessmentStart || !opts.lastTxnDate) return false;
  return opts.lastTxnDate < opts.assessmentStart;
}

export type XlvDeviceDisplayInput = {
  alertKind: XlvDeviceAlertKind;
  qualificationStatus?: XlvQualificationStatus | null;
  sleepDays: number;
  cumulativeTxns?: number;
};

function effectiveAlertKind(d: XlvDeviceDisplayInput): XlvDeviceAlertKind {
  if (d.cumulativeTxns != null) {
    return xlvEffectiveAlertKind({
      sleepDays: d.sleepDays,
      cumulativeTxns: d.cumulativeTxns,
      qualificationStatus: d.qualificationStatus,
    });
  }
  if (d.alertKind === "dormant" && d.qualificationStatus === "qualified") {
    return "active";
  }
  return d.alertKind;
}

export function xlvSleepAlertBadgeLabel(
  alertKind: XlvDeviceAlertKind
): "单笔沉默" | "沉睡" | null {
  if (alertKind === "single_silence") return "单笔沉默";
  if (alertKind === "dormant") return "沉睡";
  return null;
}

export function xlvShouldShowSleepAlertBadge(d: XlvDeviceDisplayInput) {
  const kind = effectiveAlertKind(d);
  return kind === "single_silence" || kind === "dormant";
}

export function xlvShouldShowQualificationBadge(
  d: XlvDeviceDisplayInput,
  opts?: { showQualification?: boolean; hideQualificationBadge?: boolean }
) {
  const showQualification = opts?.showQualification ?? true;
  if (!showQualification || opts?.hideQualificationBadge || !d.qualificationStatus) {
    return false;
  }
  return !xlvShouldShowSleepAlertBadge(d);
}

export function xlvDeviceCardRightLabel(
  d: XlvDeviceDisplayInput,
  qualFilterActive: boolean
) {
  const kind = effectiveAlertKind(d);
  if (kind === "single_silence") {
    return { title: "单笔沉默", sub: `${d.sleepDays} 天未用` };
  }
  if (kind === "dormant") {
    return { title: `${d.sleepDays} 天`, sub: "沉睡" };
  }
  if (d.qualificationStatus === "qualified") {
    return {
      title: qualFilterActive ? "已达标" : "",
      sub: d.sleepDays === 0 ? "近日有动" : `${d.sleepDays} 天`,
    };
  }
  if (d.qualificationStatus === "in_progress") {
    return {
      title: "考核中",
      sub: d.sleepDays === 0 ? "近日有动" : `${d.sleepDays} 天`,
    };
  }
  if (d.qualificationStatus === "invalid") {
    return {
      title: XLV_QUALIFICATION_LABELS.invalid,
      sub: d.sleepDays === 0 ? "近日有动" : `${d.sleepDays} 天`,
    };
  }
  return {
    title: "考核中",
    sub: d.sleepDays === 0 ? "近日有动" : `${d.sleepDays} 天`,
  };
}

export function xlvDeviceCardRightTitleClass(d: XlvDeviceDisplayInput) {
  const kind = effectiveAlertKind(d);
  if (kind === "single_silence" || kind === "dormant") {
    return "text-[#c41e3a]";
  }
  if (d.qualificationStatus === "qualified") {
    return "text-emerald-700";
  }
  if (d.qualificationStatus === "invalid") {
    return "text-slate-600";
  }
  return "text-sky-800";
}

/** 列表/详情/导出：用户可见状态（不含「正常」） */
export function xlvDeviceUserStatusLabel(d: XlvDeviceDisplayInput): string {
  const kind = effectiveAlertKind(d);
  const sleep = xlvSleepAlertBadgeLabel(kind);
  if (sleep) return sleep;
  if (d.qualificationStatus) {
    return XLV_QUALIFICATION_LABELS[d.qualificationStatus];
  }
  return "考核中";
}

export function xlvSleepAlertBadgeClass(alertKind: XlvDeviceAlertKind) {
  if (alertKind === "single_silence") {
    return "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]";
  }
  if (alertKind === "dormant") {
    return "bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]";
  }
  return "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]";
}
