import type { User } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/permissions";
import { db } from "@/lib/db";
import { canAdminManageUser } from "@/lib/admin-user-permissions";
import { buildManagerManagedUserWhere } from "@/services/stats/manager-scope";

export class AdminAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AdminAccessError";
    this.status = status;
  }
}

/** 校验操作者是否有权管理目标用户（含团队/管辖范围） */
export async function assertAdminCanManageTarget(
  actor: SessionUser,
  targetId: string
): Promise<User> {
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new AdminAccessError("用户不存在", 404);
  }

  if (!canAdminManageUser(actor.role, target.role)) {
    throw new AdminAccessError("无权操作该账号", 403);
  }

  if (actor.role === "DIRECTOR") {
    return target;
  }

  if (actor.role === "MANAGER") {
    const scope = await buildManagerManagedUserWhere(actor.id);
    const inScope = await db.user.findFirst({
      where: { AND: [scope, { id: targetId }] },
    });
    if (!inScope) {
      throw new AdminAccessError("无权操作该账号", 403);
    }
    return target;
  }

  throw new AdminAccessError("无权操作该账号", 403);
}

export function adminAccessErrorResponse(err: unknown) {
  if (err instanceof AdminAccessError) {
    return { error: err.message, status: err.status };
  }
  return null;
}
