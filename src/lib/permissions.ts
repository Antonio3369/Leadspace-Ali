import type { AccountLifecycle, UserRole, UserStatus } from "@/generated/prisma/client";

export type DataScope = "global" | "team" | "personal";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  teamId: string | null;
  accountLifecycle: AccountLifecycle;
  mustChangePassword: boolean;
}

export interface AccessibleScope {
  /** 可查看的用户 ID 列表；null 表示全量 */
  userIds: string[] | null;
  /** 可查看的团队 ID 列表；null 表示全量 */
  teamIds: string[] | null;
  /** 是否可访问公共大屏 */
  canAccessBigScreen: boolean;
  /** 是否可导出 */
  canExport: boolean;
  /** 导出范围描述 */
  exportScopeLabel: string;
  /** 主管是否需要双区展示 */
  dualView: boolean;
}

/** 离职/停用账号禁止登录 */
export function canLogin(status: UserStatus): boolean {
  return status === "ACTIVE";
}

/** 仅经理/负责人等管理角色可登录；业务员为纯数据账号 */
export function canRoleSignIn(role: UserRole): boolean {
  return role !== "SALES";
}

/** 仅事业部负责人可访问公共大屏 */
export function canAccessBigScreen(role: UserRole): boolean {
  return role === "DIRECTOR";
}

/** 仅事业部负责人可上传 Excel */
export function canImportExcel(role: UserRole): boolean {
  return role === "DIRECTOR";
}

/** 是否可导出（离职/停用不可；各角色导出范围不同） */
export function canExport(_role: UserRole, status: UserStatus): boolean {
  return status === "ACTIVE";
}

export function getExportScopeLabel(role: UserRole): string {
  switch (role) {
    case "DIRECTOR":
      return "全量数据";
    case "MANAGER":
      return "所辖团队数据";
    case "SUPERVISOR":
      return "小组报表 / 个人报表";
    case "SALES":
      return "个人数据";
    default:
      return "";
  }
}

/** 团队主管强制双区 */
export function requiresDualView(role: UserRole): boolean {
  return role === "SUPERVISOR";
}

export function getRoleLevel(role: UserRole): number {
  const levels: Record<UserRole, number> = {
    DIRECTOR: 4,
    MANAGER: 3,
    SUPERVISOR: 2,
    SALES: 1,
  };
  return levels[role];
}

/** 校验目标用户是否在访问者权限范围内 */
export function isUserInScope(
  accessor: SessionUser,
  targetUserId: string,
  accessibleUserIds: string[] | null
): boolean {
  if (accessibleUserIds === null) return true;
  if (accessor.id === targetUserId) return true;
  return accessibleUserIds.includes(targetUserId);
}

/** 校验团队是否在访问者权限范围内 */
export function isTeamInScope(
  teamId: string,
  accessibleTeamIds: string[] | null
): boolean {
  if (accessibleTeamIds === null) return true;
  return accessibleTeamIds.includes(teamId);
}

/** 防止 URL/参数越权：校验请求的团队 ID */
export function assertTeamAccess(
  teamId: string | null | undefined,
  accessibleTeamIds: string[] | null
): void {
  if (!teamId) return;
  if (!isTeamInScope(teamId, accessibleTeamIds)) {
    throw new PermissionError("无权访问该团队数据");
  }
}

/** 防止 URL/参数越权：校验请求的用户 ID */
export function assertUserAccess(
  userId: string | null | undefined,
  accessor: SessionUser,
  accessibleUserIds: string[] | null
): void {
  if (!userId) return;
  if (!isUserInScope(accessor, userId, accessibleUserIds)) {
    throw new PermissionError("无权访问该人员数据");
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
