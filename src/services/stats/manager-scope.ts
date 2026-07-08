import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/permissions";
import { parseDateFromParam, parseDateToParam } from "@/lib/ledger-date";

export async function getManagerOrThrow(managerId: string) {
  const manager = await db.user.findFirst({
    where: { id: managerId, role: "MANAGER", status: "ACTIVE" },
    include: { team: { select: { name: true } } },
  });
  if (!manager) {
    throw new Error("经理不存在");
  }
  return manager;
}

export async function buildManagerStaffUserWhere(managerId: string): Promise<Prisma.UserWhereInput> {
  const base = await buildManagerManagedUserWhere(managerId);
  return { AND: [base, { status: "ACTIVE" }] };
}

/** 经理管辖范围内的业务员/主管（含已停用，用于账号管理） */
export async function buildManagerManagedUserWhere(
  managerId: string
): Promise<Prisma.UserWhereInput> {
  const manager = await getManagerOrThrow(managerId);

  if (manager.teamId) {
    return {
      teamId: manager.teamId,
      role: { in: ["SALES", "SUPERVISOR"] },
    };
  }

  return {
    OR: [{ managerId: manager.id }, { manager: { managerId: manager.id } }],
    role: { in: ["SALES", "SUPERVISOR"] },
  };
}

/** 经理所辖商户：以团队 teamId 为主 */
export async function buildManagerMerchantWhere(
  managerId: string
): Promise<Prisma.MerchantRecordWhereInput> {
  const manager = await getManagerOrThrow(managerId);
  if (manager.teamId) {
    return { teamId: manager.teamId };
  }
  const subs = await db.user.findMany({
    where: { managerId: manager.id },
    select: { id: true },
  });
  return {
    salesUserId: { in: [manager.id, ...subs.map((s) => s.id)] },
  };
}

export function withExpandDateRange(
  where: Prisma.MerchantRecordWhereInput,
  dateFrom?: string,
  dateTo?: string
): Prisma.MerchantRecordWhereInput {
  if (!dateFrom && !dateTo) return where;
  return {
    AND: [
      where,
      {
        expandDate: {
          ...(dateFrom ? { gte: parseDateFromParam(dateFrom) } : {}),
          ...(dateTo ? { lte: parseDateToParam(dateTo) } : {}),
        },
      },
    ],
  };
}

export async function assertDirectorCanViewManager(
  user: SessionUser,
  managerId: string
) {
  if (user.role !== "DIRECTOR") {
    throw new Error("无权查看该经理数据");
  }
  await getManagerOrThrow(managerId);
}

export async function assertManagerCanViewStaff(user: SessionUser, staffId: string) {
  if (user.role !== "MANAGER") {
    throw new Error("无权查看该人员数据");
  }

  const staffWhere = await buildManagerManagedUserWhere(user.id);
  const staff = await db.user.findFirst({
    where: { AND: [staffWhere, { id: staffId }] },
    include: { team: { select: { name: true } } },
  });

  if (!staff) {
    throw new Error("无权查看该人员数据");
  }

  return staff;
}

export async function buildStaffMerchantWhere(
  staffId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<Prisma.MerchantRecordWhereInput> {
  return withExpandDateRange({ salesUserId: staffId }, dateFrom, dateTo);
}
