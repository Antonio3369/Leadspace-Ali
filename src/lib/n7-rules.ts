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

export function priorityRank(p: N7Priority): number {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[p];
}

export function ratePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
