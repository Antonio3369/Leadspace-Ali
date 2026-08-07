import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { canAccessBusinessLine } from "@/lib/business-lines";
import {
  type XlvAlertKind,
  XLV_INVENTORY_MANAGER_KEY,
  XLV_INVENTORY_MANAGER_LABEL,
  XLV_SLEEP_THRESHOLD_DAYS,
  isXlvInventoryManagerKey,
  xlvManagerDisplayName,
} from "@/lib/xlv-rules";

export function canViewXlv(role: SessionUser["role"]): boolean {
  return role === "DIRECTOR" || role === "MANAGER" || role === "SALES";
}

export function canAccessXlvWorkspace(
  user: Pick<SessionUser, "role" | "businessLines">
) {
  return (
    canViewXlv(user.role) &&
    canAccessBusinessLine(user.role, user.businessLines, "xlv")
  );
}

export function assertCanViewXlv(user: SessionUser) {
  if (!canViewXlv(user.role)) {
    throw new PermissionError("无权访问微信小绿盒数据");
  }
  if (!canAccessBusinessLine(user.role, user.businessLines, "xlv")) {
    throw new PermissionError("未开通微信小绿盒业务线");
  }
}

export function buildXlvRoleWhere(user: SessionUser): Prisma.XlvDeviceRecordWhereInput {
  if (user.role === "MANAGER") {
    return {
      OR: [
        { managerUserId: user.id },
        { managerUserId: null, managerName: user.name },
      ],
    };
  }
  if (user.role === "SALES") {
    return {
      OR: [
        { salesUserId: user.id },
        { salesUserId: null, operatorName: user.name },
      ],
    };
  }
  return {};
}

export function buildXlvInventoryDeviceWhere(): Prisma.XlvDeviceRecordWhereInput {
  return { managerUserId: null, managerName: "" };
}

/** 已挂经理/队员的设备（排除剩余库存） */
export function buildXlvAssignedDeviceWhere(): Prisma.XlvDeviceRecordWhereInput {
  return { NOT: buildXlvInventoryDeviceWhere() };
}

export function buildXlvAlertWhere(
  alert: XlvAlertKind
): Prisma.XlvDeviceRecordWhereInput {
  if (alert === "single_silence") {
    return {
      AND: [
        buildXlvAssignedDeviceWhere(),
        {
          cumulativeTxns: 1,
          sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS },
        },
      ],
    };
  }
  if (alert === "dormant") {
    return {
      AND: [
        buildXlvAssignedDeviceWhere(),
        {
          sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS },
          NOT: { cumulativeTxns: 1 },
        },
      ],
    };
  }
  if (alert === "active") {
    return {
      AND: [
        buildXlvAssignedDeviceWhere(),
        { sleepDays: { lt: XLV_SLEEP_THRESHOLD_DAYS } },
      ],
    };
  }
  return {};
}

export function buildXlvDeviceWhere(
  user: SessionUser,
  opts?: {
    alert?: XlvAlertKind;
    managerName?: string | null;
    operatorName?: string | null;
    search?: string | null;
  }
): Prisma.XlvDeviceRecordWhereInput {
  assertCanViewXlv(user);
  const parts: Prisma.XlvDeviceRecordWhereInput[] = [buildXlvRoleWhere(user)];

  const managerFilter = opts?.managerName?.trim();
  const viewingInventory = managerFilter === XLV_INVENTORY_MANAGER_LABEL;

  if (opts?.alert && opts.alert !== "all") {
    parts.push(buildXlvAlertWhere(opts.alert));
  } else if (!viewingInventory) {
    // 默认列表只看已铺设（排除剩余库存）
    parts.push(buildXlvAssignedDeviceWhere());
  }

  if (user.role === "DIRECTOR" && managerFilter) {
    if (viewingInventory) {
      parts.push(buildXlvInventoryDeviceWhere());
    } else {
      parts.push({ managerName: managerFilter });
    }
  }

  if (
    (user.role === "DIRECTOR" || user.role === "MANAGER") &&
    opts?.operatorName?.trim()
  ) {
    parts.push({ operatorName: opts.operatorName.trim() });
  }

  const q = opts?.search?.trim();
  if (q) {
    parts.push({
      OR: [
        { deviceSn: { contains: q, mode: "insensitive" } },
        { merchantName: { contains: q, mode: "insensitive" } },
        { operatorName: { contains: q, mode: "insensitive" } },
        { managerName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return parts.length === 1 ? parts[0]! : { AND: parts };
}

export function xlvManagerKeyOf(record: {
  managerUserId: string | null;
  managerName: string;
}) {
  if (record.managerUserId) return record.managerUserId;
  const name = record.managerName?.trim();
  return name ? `name:${name}` : XLV_INVENTORY_MANAGER_KEY;
}

export function xlvStaffKeyOf(record: {
  salesUserId: string | null;
  operatorName: string;
}) {
  return record.salesUserId ?? `name:${record.operatorName || "未分配"}`;
}

export async function buildXlvManagerDeviceWhere(
  managerKey: string
): Promise<Prisma.XlvDeviceRecordWhereInput> {
  if (isXlvInventoryManagerKey(managerKey)) {
    return { managerUserId: null, managerName: "" };
  }
  if (managerKey.startsWith("name:")) {
    return { managerName: managerKey.slice(5) };
  }
  const user = await db.user.findUnique({
    where: { id: managerKey },
    select: { name: true },
  });
  if (!user) return { managerUserId: managerKey };
  return {
    OR: [
      { managerUserId: managerKey },
      { AND: [{ managerUserId: null }, { managerName: user.name }] },
    ],
  };
}

export async function buildXlvStaffDeviceWhere(
  staffKey: string
): Promise<Prisma.XlvDeviceRecordWhereInput> {
  if (staffKey.startsWith("name:")) {
    return { operatorName: staffKey.slice(5) };
  }
  const user = await db.user.findUnique({
    where: { id: staffKey },
    select: { name: true },
  });
  if (!user) return { salesUserId: staffKey };
  return {
    OR: [
      { salesUserId: staffKey },
      { AND: [{ salesUserId: null }, { operatorName: user.name }] },
    ],
  };
}

export function assertManagerOwnsXlvKey(user: SessionUser, managerKey: string) {
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

export async function assertCanViewXlvDevice(user: SessionUser, deviceSn: string) {
  assertCanViewXlv(user);
  if (user.role === "DIRECTOR") return;

  const device = await db.xlvDeviceRecord.findUnique({
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
    if (device.salesUserId === user.id) return;
    if (device.operatorName === user.name) return;
    throw new PermissionError("无权查看该设备");
  }

  const owns =
    device.managerUserId === user.id ||
    (device.managerUserId == null && device.managerName === user.name);
  if (!owns) {
    throw new PermissionError("无权查看该设备");
  }
}
