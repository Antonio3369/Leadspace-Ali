import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { allocatePinyinUsername } from "@/lib/pinyin-username";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { buildManagerManagedUserWhere } from "@/services/stats/manager-scope";

export const TEAM_SALES_DEFAULT_PASSWORD = "123456";

export type TeamSalesCreds = {
  id: string;
  name: string;
  username: string;
  status: string;
  password: string;
  nameHint?: string;
};

/** 经理本队按姓名开号（可登录；仅 N7；首登改密） */
export async function createTeamSalesLoginAccount(
  actor: SessionUser,
  rawName: string
): Promise<TeamSalesCreds> {
  if (actor.role !== "MANAGER") {
    throw new PermissionError("仅经理可新增本队队员");
  }

  const name = rawName.trim();
  if (!name) throw new Error("请填写队员姓名");
  if (name.length > 20) throw new Error("姓名过长");

  const manager = await db.user.findUnique({
    where: { id: actor.id },
    select: { id: true, teamId: true, name: true },
  });
  if (!manager) throw new Error("经理账号不存在");

  const sameInTeam = await db.user.findFirst({
    where: { role: "SALES", name, managerId: actor.id },
    select: { id: true },
  });
  if (sameInTeam) {
    throw new Error(`本队已有同名「${name}」，请勿重复添加`);
  }

  const sameElsewhere = await db.user.count({
    where: {
      role: "SALES",
      name,
      NOT: { managerId: actor.id },
    },
  });

  const username = await allocatePinyinUsername(name);
  const passwordHash = await bcrypt.hash(TEAM_SALES_DEFAULT_PASSWORD, 10);

  const created = await db.user.create({
    data: {
      name,
      username,
      passwordHash,
      role: "SALES",
      status: "ACTIVE",
      managerId: actor.id,
      teamId: manager.teamId ?? undefined,
      accountLifecycle: "ACTIVE",
      mustChangePassword: true,
      businessLines: ["n7"],
    },
    select: { id: true, name: true, username: true, status: true },
  });

  // 把本经理名下、作业员姓名匹配的设备挂到新帐号（避免导入旧号占着 salesUserId 导致新号无数据）
  const relinked = await db.n7DeviceRecord.updateMany({
    where: {
      operatorName: name,
      OR: [
        { managerUserId: actor.id },
        ...(manager.name ? [{ managerName: manager.name }] : []),
      ],
    },
    data: { salesUserId: created.id },
  });

  return {
    ...created,
    password: TEAM_SALES_DEFAULT_PASSWORD,
    nameHint:
      sameElsewhere > 0
        ? `系统中其他队伍已有同名「${name}」。已在本队新建账号 ${username}；已挂靠本队相关设备 ${relinked.count} 台。`
        : relinked.count > 0
          ? `已挂靠本队相关设备 ${relinked.count} 台到新账号。`
          : undefined,
  };
}

export async function resetTeamSalesPassword(
  actor: SessionUser,
  salesId: string
): Promise<{ username: string; password: string; name: string }> {
  if (actor.role !== "MANAGER") {
    throw new PermissionError("仅经理可重置本队队员密码");
  }

  const scope = await buildManagerManagedUserWhere(actor.id);
  const target = await db.user.findFirst({
    where: { AND: [scope, { id: salesId, role: "SALES" }] },
  });
  if (!target) throw new PermissionError("只能操作本队队员");

  const passwordHash = await bcrypt.hash(TEAM_SALES_DEFAULT_PASSWORD, 10);
  const updated = await db.user.update({
    where: { id: salesId },
    data: {
      passwordHash,
      mustChangePassword: true,
      accountLifecycle: "ACTIVE",
      managerId: target.managerId ?? actor.id,
      status: target.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      businessLines:
        target.businessLines.length > 0 ? target.businessLines : ["n7"],
    },
    select: { username: true, name: true },
  });

  return {
    username: updated.username,
    password: TEAM_SALES_DEFAULT_PASSWORD,
    name: updated.name,
  };
}

/** Excel 导入时：新建或补开通登录（已开通不覆盖密码） */
export async function salesLoginFieldsForImport(existingPasswordHash: string | null | undefined) {
  if (existingPasswordHash) {
    return null;
  }
  const passwordHash = await bcrypt.hash(TEAM_SALES_DEFAULT_PASSWORD, 10);
  return {
    passwordHash,
    accountLifecycle: "ACTIVE" as const,
    mustChangePassword: true,
    businessLines: ["n7"] as string[],
  };
}
