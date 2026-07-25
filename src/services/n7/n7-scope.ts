import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { canAccessBusinessLine } from "@/lib/business-lines";

/** 可查看 N7 工作台（导入仍仅 DIRECTOR） */
export function canViewN7(role: SessionUser["role"]): boolean {
  return role === "DIRECTOR" || role === "MANAGER" || role === "SALES";
}

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
 * - DIRECTOR：可用 query managerKey，缺省全量
 * - MANAGER：强制自己
 * - SALES：无经理范围（用 staffKey）
 */
export function resolveN7ManagerKey(
  user: SessionUser,
  requested: string | null | undefined
): string | null {
  assertCanViewN7(user);
  if (user.role === "SALES") return null;
  if (user.role === "MANAGER") {
    if (requested && requested !== user.id && requested !== `name:${user.name}`) {
      throw new PermissionError("无权查看其他经理的数据");
    }
    return user.id;
  }
  return requested?.trim() ? requested : null;
}

/** 队员强制个人范围 */
export function resolveN7StaffKey(user: SessionUser): string | null {
  assertCanViewN7(user);
  if (user.role === "SALES") return user.id;
  return null;
}

export function assertManagerOwnsKey(user: SessionUser, managerKey: string) {
  if (user.role === "DIRECTOR") return;
  if (user.role === "SALES") {
    throw new PermissionError("无权访问经理看板");
  }
  if (user.role !== "MANAGER") {
    throw new PermissionError("无权访问");
  }
  const ok = managerKey === user.id || managerKey === `name:${user.name}`;
  if (!ok) {
    throw new PermissionError("无权查看其他经理的数据");
  }
}

export async function assertCanViewN7Device(user: SessionUser, deviceSn: string) {
  assertCanViewN7(user);
  if (user.role === "DIRECTOR") return;

  const device = await db.n7DeviceRecord.findUnique({
    where: { deviceSn },
    select: {
      managerUserId: true,
      managerName: true,
      salesUserId: true,
      operatorName: true,
    },
  });
  if (!device) {
    throw new Error("设备不存在");
  }

  if (user.role === "SALES") {
    const owns =
      device.salesUserId === user.id ||
      (device.salesUserId == null && device.operatorName === user.name);
    if (!owns) {
      throw new PermissionError("无权查看该设备");
    }
    return;
  }

  const owns =
    device.managerUserId === user.id ||
    (device.managerUserId == null && device.managerName === user.name);
  if (!owns) {
    throw new PermissionError("无权查看该设备");
  }
}
