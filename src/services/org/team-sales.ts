import bcrypt from "bcryptjs";
import type { AccountLifecycle } from "@/generated/prisma/client";
import { canSignIn } from "@/lib/account-lifecycle";
import { db } from "@/lib/db";
import { allocatePinyinUsername } from "@/lib/pinyin-username";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { buildManagerManagedUserWhere } from "@/services/stats/manager-scope";

export const TEAM_SALES_DEFAULT_PASSWORD = "123456";

/** 在职队员是否已具备登录条件（有密码且生命周期非 IMPORTED） */
export function salesHasLoginAccess(user: {
  accountLifecycle: AccountLifecycle;
  passwordHash: string | null | undefined;
}): boolean {
  return canSignIn(user.accountLifecycle, user.passwordHash);
}

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

/**
 * 经理彻底删除本队队员账号。
 * 设备/商户记录保留，仅清空 salesUserId 挂靠；不可恢复。
 */
export async function deleteTeamSalesAccount(
  actor: SessionUser,
  salesId: string
): Promise<{ name: string; username: string; deviceCount: number }> {
  if (actor.role !== "MANAGER") {
    throw new PermissionError("仅经理可删除本队队员");
  }
  if (actor.id === salesId) {
    throw new Error("不能删除自己的账号");
  }

  const scope = await buildManagerManagedUserWhere(actor.id);
  const target = await db.user.findFirst({
    where: { AND: [scope, { id: salesId, role: "SALES" }] },
    select: { id: true, name: true, username: true },
  });
  if (!target) throw new PermissionError("只能删除本队队员");

  const deviceCount = await db.n7DeviceRecord.count({
    where: { salesUserId: target.id },
  });

  await db.$transaction(async (tx) => {
    await tx.n7DeviceRecord.updateMany({
      where: { salesUserId: target.id },
      data: { salesUserId: null },
    });
    await tx.n7DeviceRecord.updateMany({
      where: { managerUserId: target.id },
      data: { managerUserId: null },
    });
    await tx.merchantRecord.updateMany({
      where: { salesUserId: target.id },
      data: { salesUserId: null },
    });
    await tx.importLog.updateMany({
      where: { uploadedById: target.id },
      data: { uploadedById: actor.id },
    });
    await tx.heavyImportJob.updateMany({
      where: { uploadedById: target.id },
      data: { uploadedById: actor.id },
    });
    await tx.user.updateMany({
      where: { managerId: target.id },
      data: { managerId: null },
    });
    await tx.user.delete({ where: { id: target.id } });
  });

  return {
    name: target.name,
    username: target.username,
    deviceCount,
  };
}

type DedupeSalesRow = {
  id: string;
  name: string;
  username: string;
  managerId: string | null;
  createdAt: Date;
  passwordHash: string | null;
  accountLifecycle: AccountLifecycle;
};

/**
 * 本队完全同名双号：仅当「一侧有数据、其余为 0」时，停用空号（不删除）。
 * - 仅同一 managerId + 姓名完全一致
 * - 双侧（及以上）都有数据 → 整组跳过
 * - 全部无数据 → 留拼音号，停用其余空号
 * - 不做近音/近形合并
 */
export async function dedupeSameNameTeamSales(managerId: string): Promise<{
  groups: number;
  skipped: number;
  disabled: number;
  kept: Array<{ name: string; keepUsername: string; disabledUsernames: string[] }>;
}> {
  const manager = await db.user.findUnique({
    where: { id: managerId },
    select: { id: true, name: true },
  });
  if (!manager) return { groups: 0, skipped: 0, disabled: 0, kept: [] };

  const roster = await db.user.findMany({
    where: {
      role: "SALES",
      managerId,
      status: { not: "DISABLED" },
    },
    select: {
      id: true,
      name: true,
      username: true,
      managerId: true,
      createdAt: true,
      passwordHash: true,
      accountLifecycle: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const byName = new Map<string, DedupeSalesRow[]>();
  for (const row of roster) {
    const list = byName.get(row.name) ?? [];
    list.push(row);
    byName.set(row.name, list);
  }

  const kept: Array<{
    name: string;
    keepUsername: string;
    disabledUsernames: string[];
  }> = [];
  let disabled = 0;
  let groups = 0;
  let skipped = 0;

  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    groups += 1;

    const scored = await Promise.all(
      list.map(async (u) => {
        const byId = await db.n7DeviceRecord.count({
          where: { salesUserId: u.id },
        });
        return {
          user: u,
          byId,
          preferPinyin: !u.username.startsWith("sales_"),
          hasLogin: salesHasLoginAccess(u),
        };
      })
    );

    const withData = scored.filter((s) => s.byId > 0);
    // 两个及以上都有挂靠数据：可能是真同名两人，整组跳过
    if (withData.length >= 2) {
      skipped += 1;
      continue;
    }

    let winner = withData[0];
    if (!winner) {
      // 全部无数据：留拼音号 / 可登录 / 较新
      const empty = [...scored].sort((a, b) => {
        if (a.preferPinyin !== b.preferPinyin) return a.preferPinyin ? -1 : 1;
        if (a.hasLogin !== b.hasLogin) return a.hasLogin ? -1 : 1;
        return b.user.createdAt.getTime() - a.user.createdAt.getTime();
      });
      winner = empty[0]!;
    }

    const losers = scored.filter((s) => s.user.id !== winner!.user.id);
    // 只停用「数据为 0」的号；有数据的赢家之外若还有有数据号，上面已 skip
    const emptyLosers = losers.filter((s) => s.byId === 0);
    if (emptyLosers.length === 0) {
      skipped += 1;
      continue;
    }

    const disabledUsernames: string[] = [];
    for (const loser of emptyLosers) {
      await db.n7DeviceRecord.updateMany({
        where: { salesUserId: loser.user.id },
        data: { salesUserId: winner.user.id },
      });
      await db.user.update({
        where: { id: loser.user.id },
        data: { status: "DISABLED" },
      });
      disabled += 1;
      disabledUsernames.push(loser.user.username);
    }

    // 本经理 + 该作业员姓名的设备统一挂到保留号（避免空号解挂后无人认领）
    await db.n7DeviceRecord.updateMany({
      where: {
        operatorName: name,
        OR: [{ managerUserId: managerId }, { managerName: manager.name }],
      },
      data: { salesUserId: winner.user.id },
    });

    kept.push({
      name,
      keepUsername: winner.user.username,
      disabledUsernames,
    });
  }

  return { groups, skipped, disabled, kept };
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

/** 仅 N7 队员：已挂 n7，或尚未写业务线（本队开号默认 n7） */
function isN7SalesCandidate(businessLines: string[]): boolean {
  if (businessLines.length === 0) return true;
  return businessLines.includes("n7");
}

/**
 * 补开通 N7 历史导入队员：在职且尚不能登录 → 默认密码 + ACTIVE。
 * 已有密码仅纠正 lifecycle；无密码则写入默认密码并要求首登改密。
 * 不处理仅开通小蓝环、无 n7 的账号。
 */
export async function backfillSalesLoginAccounts(userIds?: string[]): Promise<{
  enabled: number;
  usernames: string[];
}> {
  const candidates = await db.user.findMany({
    where: {
      role: "SALES",
      status: { not: "DISABLED" },
      ...(userIds?.length ? { id: { in: userIds } } : {}),
    },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      accountLifecycle: true,
      businessLines: true,
    },
  });

  const needFix = candidates.filter(
    (u) => isN7SalesCandidate(u.businessLines) && !salesHasLoginAccess(u)
  );
  if (needFix.length === 0) {
    return { enabled: 0, usernames: [] };
  }

  const defaultHash = await bcrypt.hash(TEAM_SALES_DEFAULT_PASSWORD, 10);
  const usernames: string[] = [];

  for (const u of needFix) {
    const hasPassword = Boolean(u.passwordHash);
    const lines =
      u.businessLines.length > 0
        ? u.businessLines.includes("n7")
          ? u.businessLines
          : [...u.businessLines, "n7"]
        : ["n7"];
    await db.user.update({
      where: { id: u.id },
      data: {
        passwordHash: hasPassword ? u.passwordHash! : defaultHash,
        accountLifecycle: "ACTIVE",
        mustChangePassword: hasPassword ? undefined : true,
        status: "ACTIVE",
        businessLines: lines,
      },
    });
    usernames.push(u.username);
  }

  return { enabled: usernames.length, usernames };
}
