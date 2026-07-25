import bcrypt from "bcryptjs";
import { MANAGER_ENABLED_LIFECYCLE } from "@/lib/account-lifecycle";
import { db } from "@/lib/db";
import {
  allocatePinyinUsername,
  chineseNameToPinyinUsername,
} from "@/lib/pinyin-username";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";

export const MANAGER_DEFAULT_PASSWORD = "123456";

export type CreateManagerResult = {
  id: string;
  name: string;
  username: string;
  password: string;
  teamId: string;
};

/** 管理员在 N7 导入页按姓名开经理号（仅 N7；首登改密） */
export async function createManagerLoginAccount(
  actor: SessionUser,
  rawName: string
): Promise<CreateManagerResult> {
  if (actor.role !== "DIRECTOR") {
    throw new PermissionError("仅管理员可开经理账号");
  }

  const name = rawName.trim();
  if (!name) throw new Error("请填写经理姓名");
  if (name.length > 20) throw new Error("姓名过长");

  const existing = await db.user.findFirst({
    where: { name, role: "MANAGER" },
    select: { id: true, passwordHash: true, accountLifecycle: true },
  });
  if (existing?.passwordHash && existing.accountLifecycle !== "IMPORTED") {
    throw new Error(`经理「${name}」已开通，请勿重复开号`);
  }

  const division = await db.orgUnit.upsert({
    where: { id: "div-leadspace" },
    create: { id: "div-leadspace", name: "Leadspace 事业部", type: "DIVISION" },
    update: {},
  });

  const region = await db.orgUnit.upsert({
    where: { id: "region-main" },
    create: {
      id: "region-main",
      name: "业务区域",
      type: "REGION",
      parentId: division.id,
    },
    update: {},
  });

  const teamId = `team-${chineseNameToPinyinUsername(name)}`;
  await db.orgUnit.upsert({
    where: { id: teamId },
    create: {
      id: teamId,
      name: `${name}团队`,
      type: "TEAM",
      parentId: region.id,
    },
    update: { name: `${name}团队` },
  });

  const username = await allocatePinyinUsername(name, existing?.id);
  const passwordHash = await bcrypt.hash(MANAGER_DEFAULT_PASSWORD, 10);

  if (existing) {
    const updated = await db.user.update({
      where: { id: existing.id },
      data: {
        username,
        passwordHash,
        name,
        teamId,
        status: "ACTIVE",
        accountLifecycle: MANAGER_ENABLED_LIFECYCLE,
        mustChangePassword: true,
        businessLines: ["n7"],
      },
      select: { id: true, name: true, username: true },
    });
    return {
      ...updated,
      password: MANAGER_DEFAULT_PASSWORD,
      teamId,
    };
  }

  const created = await db.user.create({
    data: {
      username,
      passwordHash,
      name,
      role: "MANAGER",
      status: "ACTIVE",
      teamId,
      accountLifecycle: MANAGER_ENABLED_LIFECYCLE,
      mustChangePassword: true,
      businessLines: ["n7"],
    },
    select: { id: true, name: true, username: true },
  });

  return {
    ...created,
    password: MANAGER_DEFAULT_PASSWORD,
    teamId,
  };
}
