import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { canAccessBusinessLine } from "@/lib/business-lines";

/** 可查看 N7 看板的角色（导入仍仅 DIRECTOR） */
export function canViewN7(role: SessionUser["role"]): boolean {
  return role === "DIRECTOR" || role === "MANAGER";
}

/** 角色 + 业务线都开通才可进 N7 */
export function canAccessN7Workspace(user: Pick<SessionUser, "role" | "businessLines">) {
  return (
    canViewN7(user.role) &&
    canAccessBusinessLine(user.role, user.businessLines, "n7")
  );
}

export function assertCanViewN7(user: SessionUser) {
  if (!canViewN7(user.role)) {
    throw new PermissionError("无权访问 N7 数据");
  }
  if (!canAccessBusinessLine(user.role, user.businessLines, "n7")) {
    throw new PermissionError("未开通支付宝 N7 业务线");
  }
}

/**
 * 解析请求中的经理范围：
 * - DIRECTOR：可用 query 的 managerKey，缺省为全量（null）
 * - MANAGER：强制为自己的 user.id，禁止查看其他经理
 */
export function resolveN7ManagerKey(
  user: SessionUser,
  requested: string | null | undefined
): string | null {
  assertCanViewN7(user);
  if (user.role === "MANAGER") {
    if (requested && requested !== user.id && requested !== `name:${user.name}`) {
      throw new PermissionError("无权查看其他经理的数据");
    }
    return user.id;
  }
  return requested?.trim() ? requested : null;
}

/** 经理访问某 managerKey 路由时校验（允许 id 或 name:自己姓名） */
export function assertManagerOwnsKey(user: SessionUser, managerKey: string) {
  if (user.role === "DIRECTOR") return;
  if (user.role !== "MANAGER") {
    throw new PermissionError("无权访问");
  }
  const ok =
    managerKey === user.id || managerKey === `name:${user.name}`;
  if (!ok) {
    throw new PermissionError("无权查看其他经理的数据");
  }
}

/** 设备详情：经理只能看自己名下设备（优先 userId；未绑定 id 时才比姓名） */
export async function assertCanViewN7Device(user: SessionUser, deviceSn: string) {
  assertCanViewN7(user);
  if (user.role === "DIRECTOR") return;

  const device = await db.n7DeviceRecord.findUnique({
    where: { deviceSn },
    select: { managerUserId: true, managerName: true },
  });
  if (!device) {
    throw new Error("设备不存在");
  }

  const owns =
    device.managerUserId === user.id ||
    (device.managerUserId == null && device.managerName === user.name);
  if (!owns) {
    throw new PermissionError("无权查看该设备");
  }
}
