import {
  XLV_QUALIFICATION_LABELS,
  type XlvDeviceAlertKind,
  type XlvQualificationStatus,
} from "@/lib/xlv-rules";

export type XlvDeviceDisplayInput = {
  alertKind: XlvDeviceAlertKind;
  qualificationStatus?: XlvQualificationStatus | null;
  sleepDays: number;
};

export function xlvSleepAlertBadgeLabel(
  alertKind: XlvDeviceAlertKind
): "单笔沉默" | "沉睡" | null {
  if (alertKind === "single_silence") return "单笔沉默";
  if (alertKind === "dormant") return "沉睡";
  return null;
}

export function xlvShouldShowSleepAlertBadge(d: XlvDeviceDisplayInput) {
  return d.alertKind === "single_silence" || d.alertKind === "dormant";
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
  if (d.alertKind === "single_silence") {
    return { title: "单笔沉默", sub: `${d.sleepDays} 天未用` };
  }
  if (d.alertKind === "dormant") {
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
  if (d.alertKind === "single_silence" || d.alertKind === "dormant") {
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
  const sleep = xlvSleepAlertBadgeLabel(d.alertKind);
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
