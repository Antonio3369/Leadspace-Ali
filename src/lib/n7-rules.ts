/** N7 考核与跟进优先级规则（与运营表/经理沟通纪要对齐） */

export const N7_QUALIFY_DAYS = 3;
export const N7_QUALIFY_USERS = 3;

export type N7Priority = "P0" | "P1" | "P2" | "P3";

export type N7FailReason =
  | "天数+用户都不足"
  | "仅天数不足"
  | "仅用户不足"
  | "指标已够";

export function isFollowUpCandidate(input: {
  isQualified: boolean;
  remainingDays: number | null;
  remainingEnded: boolean;
}): boolean {
  if (input.isQualified) return false;
  if (input.remainingEnded) return false;
  if (input.remainingDays == null) return false;
  return true;
}

/** P0：剩余 0/1/2 天；P1：零动销且剩余≥6；P2：行为未完成；其余 P3 */
export function resolveN7Priority(input: {
  isQualified: boolean;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
  effectiveUsers: number;
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
}): N7Priority | null {
  if (!isFollowUpCandidate(input)) return null;

  const rem = input.remainingDays!;
  if (rem === 0 || rem === 1 || rem === 2) return "P0";
  if (input.effectiveDays === 0 && input.effectiveUsers === 0 && rem >= 6) {
    return "P1";
  }
  if (input.notLit || input.notSubscribed || input.notCheckedIn) return "P2";
  return "P3";
}

export function resolveN7FailReason(
  effectiveDays: number,
  effectiveUsers: number
): N7FailReason {
  const daysShort = effectiveDays < N7_QUALIFY_DAYS;
  const usersShort = effectiveUsers < N7_QUALIFY_USERS;
  if (daysShort && usersShort) return "天数+用户都不足";
  if (daysShort) return "仅天数不足";
  if (usersShort) return "仅用户不足";
  return "指标已够";
}

export function daysGap(effectiveDays: number): number {
  return Math.max(0, N7_QUALIFY_DAYS - effectiveDays);
}

export function usersGap(effectiveUsers: number): number {
  return Math.max(0, N7_QUALIFY_USERS - effectiveUsers);
}

/**
 * 时间上已无望：还差有效天数 > 考核剩余天数+1（含今天还能冲 1 天）。
 * 例：剩 0 天且还差 3 天 → 无望；仍展示，但应排到可追名单之后。
 */
export function isN7TimeHopeless(input: {
  isQualified: boolean;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
}): boolean {
  if (input.isQualified) return false;
  if (input.remainingEnded) return false;
  if (input.remainingDays == null || input.remainingDays < 0) return false;
  const need = daysGap(input.effectiveDays);
  if (need <= 0) return false;
  const maxEarnableDays = input.remainingDays + 1;
  return need > maxEarnableDays;
}

export function priorityRank(p: N7Priority): number {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[p];
}

/** 界面/导出用人话；内部与 URL 仍用 P0–P3 */
export const N7_PRIORITY_LABELS: Record<
  N7Priority,
  { label: string; hint: string }
> = {
  P0: { label: "剩余≤2天", hint: "考核还剩 0/1/2 天，需马上催达标" },
  P1: { label: "无动销", hint: "天数和用户都是 0，且还剩 ≥6 天" },
  P2: { label: "行为未齐", hint: "未点亮 / 未订阅 / 未打卡" },
  P3: { label: "预警", hint: "其它待跟进" },
} as const;

export function n7PriorityLabel(p: N7Priority | null | undefined): string {
  if (!p) return "—";
  return N7_PRIORITY_LABELS[p].label;
}

export function ratePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
