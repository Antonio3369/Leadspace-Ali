import type { UserRole } from "@/generated/prisma/client";

/** 管理员是否可管理目标用户（创建、开通、认证、停用、重置密码等） */
export function canAdminManageUser(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === "DIRECTOR") return targetRole === "MANAGER";
  if (actorRole === "MANAGER") return targetRole === "SUPERVISOR" || targetRole === "SALES";
  return false;
}

/** 不可被停用的角色 */
export function isProtectedFromDisable(targetRole: UserRole): boolean {
  return targetRole === "DIRECTOR";
}
