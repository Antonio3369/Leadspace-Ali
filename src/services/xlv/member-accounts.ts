import bcrypt from "bcryptjs";
import type { UserStatus, XlvMemberRole } from "@/generated/prisma/client";
import type { AccountLifecycle } from "@/generated/prisma/client";
import { canSignIn } from "@/lib/account-lifecycle";
import { db } from "@/lib/db";
import {
  allocateXlvPinyinUsername,
  reconcileXlvPinyinUsernames,
} from "@/lib/xlv-username";
import { isXlvManagerSelfSale } from "@/lib/xlv-rules";
import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { canImportExcel } from "@/lib/permissions";

export const XLV_MEMBER_DEFAULT_PASSWORD = "123456";

export type RosterRowForProvision = {
  operatorName: string;
  managerName: string;
  companyName?: string | null;
};

async function upsertMemberAccount(opts: {
  memberRole: XlvMemberRole;
  managerName: string;
  operatorName: string;
  displayName: string;
  companyName?: string | null;
}): Promise<"created" | "updated" | "skipped"> {
  const managerName = opts.managerName.trim();
  const operatorName = opts.operatorName.trim();
  const displayName = opts.displayName.trim();
  if (!managerName && opts.memberRole === "MANAGER") return "skipped";
  if (!displayName) return "skipped";

  const existing = await db.xlvMemberAccount.findFirst({
    where: {
      memberRole: opts.memberRole,
      managerName,
      operatorName,
    },
  });

  if (existing) {
    const hasLogin = canSignIn(existing.accountLifecycle, existing.passwordHash);
    await db.xlvMemberAccount.update({
      where: { id: existing.id },
      data: {
        name: displayName,
        companyName: opts.companyName?.trim() || existing.companyName,
        status: "ACTIVE",
        ...(!hasLogin
          ? {
              passwordHash: await bcrypt.hash(XLV_MEMBER_DEFAULT_PASSWORD, 10),
              accountLifecycle: "ACTIVE",
              mustChangePassword: true,
            }
          : {}),
      },
    });
    return hasLogin ? "skipped" : "updated";
  }

  // 经理变更后名册会带新 managerName；复用已有作业员账号，避免 wuziying / wuziying2 重复开号
  if (opts.memberRole === "OPERATOR" && operatorName) {
    const byOperator = await db.xlvMemberAccount.findMany({
      where: { memberRole: "OPERATOR", operatorName },
      orderBy: { createdAt: "asc" },
    });
    if (byOperator.length > 0) {
      const target =
        byOperator.find((row) => canSignIn(row.accountLifecycle, row.passwordHash)) ??
        byOperator[0]!;
      const hasLogin = canSignIn(target.accountLifecycle, target.passwordHash);
      await db.xlvMemberAccount.update({
        where: { id: target.id },
        data: {
          name: displayName,
          managerName,
          companyName: opts.companyName?.trim() || target.companyName,
          status: "ACTIVE",
          ...(!hasLogin
            ? {
                passwordHash: await bcrypt.hash(XLV_MEMBER_DEFAULT_PASSWORD, 10),
                accountLifecycle: "ACTIVE",
                mustChangePassword: true,
              }
            : {}),
        },
      });
      return hasLogin ? "skipped" : "updated";
    }
  }

  const username = await allocateXlvPinyinUsername(displayName);
  const passwordHash = await bcrypt.hash(XLV_MEMBER_DEFAULT_PASSWORD, 10);
  await db.xlvMemberAccount.create({
    data: {
      username,
      passwordHash,
      name: displayName,
      memberRole: opts.memberRole,
      managerName,
      operatorName,
      companyName: opts.companyName?.trim() || null,
      status: "ACTIVE",
      accountLifecycle: "ACTIVE",
      mustChangePassword: true,
    },
  });
  return "created";
}

/** 组织名册导入后：为经理/作业员自动开号（已有密码不覆盖） */
export async function provisionXlvAccountsFromRoster(
  rows: RosterRowForProvision[]
) {
  const managerNames = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const operatorName = row.operatorName?.trim() ?? "";
    const managerName = row.managerName?.trim() ?? "";
    if (managerName) managerNames.add(managerName);

    if (
      operatorName &&
      managerName &&
      isXlvManagerSelfSale({ operatorName, managerName })
    ) {
      const outcome = await upsertMemberAccount({
        memberRole: "MANAGER",
        managerName,
        operatorName: "",
        displayName: managerName,
        companyName: row.companyName,
      });
      if (outcome === "created") created += 1;
      else if (outcome === "updated") updated += 1;
      else skipped += 1;
      continue;
    }

    if (operatorName && managerName) {
      const outcome = await upsertMemberAccount({
        memberRole: "OPERATOR",
        managerName,
        operatorName,
        displayName: operatorName,
        companyName: row.companyName,
      });
      if (outcome === "created") created += 1;
      else if (outcome === "updated") updated += 1;
      else skipped += 1;
    }
  }

  for (const managerName of managerNames) {
    const outcome = await upsertMemberAccount({
      memberRole: "MANAGER",
      managerName,
      operatorName: "",
      displayName: managerName,
    });
    if (outcome === "created") created += 1;
    else if (outcome === "updated") updated += 1;
    else skipped += 1;
  }

  return { created, updated, skipped };
}

/** 从库内组织名册补开/更新小绿盒登录账号（历史导入、打开账号管理时调用） */
export async function backfillXlvMemberAccountsFromStoredRoster() {
  const rows = await db.xlvTeamRoster.findMany({
    select: { operatorName: true, managerName: true, companyName: true },
  });
  if (rows.length === 0) {
    return { rosterRows: 0, created: 0, updated: 0, skipped: 0, renamed: 0 };
  }
  const stats = await provisionXlvAccountsFromRoster(rows);
  const { renamed } = await reconcileXlvPinyinUsernames();
  return { rosterRows: rows.length, ...stats, renamed };
}

/** 经理打开队员管理时：仅补开本队作业员账号 */
export async function backfillXlvOperatorAccountsForManager(managerName: string) {
  const trimmed = managerName.trim();
  if (!trimmed) {
    return { rosterRows: 0, created: 0, updated: 0, skipped: 0, renamed: 0 };
  }
  const rows = await db.xlvTeamRoster.findMany({
    where: { managerName: trimmed },
    select: { operatorName: true, managerName: true, companyName: true },
  });
  if (rows.length === 0) {
    return { rosterRows: 0, created: 0, updated: 0, skipped: 0, renamed: 0 };
  }
  const stats = await provisionXlvAccountsFromRoster(rows);
  const { renamed } = await reconcileXlvPinyinUsernames();
  return { rosterRows: rows.length, ...stats, renamed };
}

export function xlvManagerNameFromSession(user: SessionUser): string {
  return (user.xlvManagerName ?? user.name).trim();
}

export function assertCanManageXlvMemberAccount(
  user: SessionUser,
  account: { memberRole: XlvMemberRole; managerName: string }
) {
  if (user.role === "DIRECTOR" && canImportExcel(user.role)) {
    if (account.memberRole !== "MANAGER") {
      throw new PermissionError("管理员仅可管理经理账号");
    }
    return;
  }

  if (user.role === "MANAGER" && user.authRealm === "xlv") {
    if (account.memberRole !== "OPERATOR") {
      throw new PermissionError("经理仅可管理本队队员账号");
    }
    const managerName = xlvManagerNameFromSession(user);
    if (account.managerName.trim() !== managerName) {
      throw new PermissionError("无权管理其他队伍的队员");
    }
    return;
  }

  throw new PermissionError("无权操作");
}

async function getXlvMemberAccountForManage(accountId: string) {
  const account = await db.xlvMemberAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      username: true,
      memberRole: true,
      managerName: true,
      operatorName: true,
      companyName: true,
      status: true,
      accountLifecycle: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });
  if (!account) throw new Error("账号不存在");
  return account;
}

export async function listXlvManagerAccountsForAdmin() {
  const rows = await db.xlvMemberAccount.findMany({
    where: { memberRole: "MANAGER" },
    orderBy: [{ managerName: "asc" }, { name: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      memberRole: true,
      managerName: true,
      operatorName: true,
      companyName: true,
      status: true,
      accountLifecycle: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    hasLogin: xlvMemberHasLogin(row),
  }));
}

export async function listXlvOperatorAccountsForManager(managerName: string) {
  const trimmed = managerName.trim();
  const rows = await db.xlvMemberAccount.findMany({
    where: { memberRole: "OPERATOR", managerName: trimmed },
    orderBy: [{ operatorName: "asc" }, { name: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      memberRole: true,
      managerName: true,
      operatorName: true,
      companyName: true,
      status: true,
      accountLifecycle: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    hasLogin: xlvMemberHasLogin(row),
  }));
}

export async function findXlvMemberByUsername(username: string) {
  return db.xlvMemberAccount.findUnique({
    where: { username },
  });
}

export function xlvMemberHasLogin(account: {
  accountLifecycle: AccountLifecycle;
  passwordHash: string | null;
}) {
  return canSignIn(account.accountLifecycle, account.passwordHash);
}

export async function listXlvMemberAccountsForAdmin() {
  return listXlvManagerAccountsForAdmin();
}

export async function resetXlvMemberPassword(
  accountId: string,
  actor: SessionUser
) {
  const account = await getXlvMemberAccountForManage(accountId);
  assertCanManageXlvMemberAccount(actor, account);

  const passwordHash = await bcrypt.hash(XLV_MEMBER_DEFAULT_PASSWORD, 10);
  await db.xlvMemberAccount.update({
    where: { id: accountId },
    data: {
      passwordHash,
      accountLifecycle: "ACTIVE",
      mustChangePassword: true,
      status: "ACTIVE",
    },
  });

  return {
    name: account.name,
    username: account.username,
    password: XLV_MEMBER_DEFAULT_PASSWORD,
  };
}

export async function setXlvMemberStatus(
  accountId: string,
  status: UserStatus,
  actor: SessionUser
) {
  const account = await getXlvMemberAccountForManage(accountId);
  assertCanManageXlvMemberAccount(actor, account);

  await db.xlvMemberAccount.update({
    where: { id: accountId },
    data: { status },
  });

  return { id: account.id, name: account.name };
}
