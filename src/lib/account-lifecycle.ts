import type { AccountLifecycle, UserRole } from "@/generated/prisma/client";

export type { AccountLifecycle };

/** 是否已开通登录（有密码且非 IMPORTED） */
export function canSignIn(
  lifecycle: AccountLifecycle,
  passwordHash: string | null | undefined
): boolean {
  if (lifecycle === "IMPORTED" || !passwordHash) return false;
  return lifecycle === "PENDING_ONBOARDING" || lifecycle === "ACTIVE";
}

/** 是否须完成实名认证 */
export function needsOnboarding(lifecycle: AccountLifecycle): boolean {
  return lifecycle === "PENDING_ONBOARDING";
}

/** 是否已完成实名认证 */
export function isOnboarded(lifecycle: AccountLifecycle): boolean {
  return lifecycle === "ACTIVE";
}

/** Excel 导入人员默认状态 */
export const IMPORTED_USER_DEFAULTS = {
  passwordHash: null,
  accountLifecycle: "IMPORTED" as const,
};

/** 经理为业务员开通账号后的状态 */
export const ENABLED_USER_DEFAULTS = {
  accountLifecycle: "PENDING_ONBOARDING" as const,
};

/** 管理员为经理开通/创建账号：直接可登录使用（与 scripts/enable-manager.ts 一致） */
export const MANAGER_ENABLED_LIFECYCLE = "ACTIVE" as const;

/** 管理员代操作后，目标用户须重新登录以刷新会话 */
export const ADMIN_TARGET_RELOGIN_HINT = "对方下次访问时将自动退出并需重新登录";

export const ENABLE_NEXT_STEPS = {
  sales:
    "请将登录名与初始密码告知对方。对方首次登录须绑定作业账号与个人 PID，完成后方可查看业务数据。",
  manager: "请将登录名与初始密码告知对方。对方可立即登录经理端使用，无需额外认证步骤。",
} as const;

export function onboardingTitle(role: UserRole): string {
  if (role === "MANAGER") return "经理实名认证";
  if (role === "SALES") return "业务员身份绑定";
  return "账号认证";
}

export function onboardingDescription(role: UserRole): string {
  if (role === "MANAGER") {
    return "请填写您的手机号码和邮箱，用于接收业务预警通知。";
  }
  if (role === "SALES") {
    return "请绑定您在支付宝后台的作业账号与个人 PID，系统将据此匹配您的业务数据。";
  }
  return "请完成账号认证。";
}
