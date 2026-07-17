import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  findManagerInIndexes,
  findUserInIndexes,
  findUserInMap,
  type UserLookupIndexes,
  type UserLookupMap,
} from "@/services/org/lookup-indexes";

export type { UserLookupIndexes, UserLookupMap };
export { findUserInIndexes, findUserInMap, findManagerInIndexes };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizePid(pid: string): string {
  return pid.trim();
}

/** 构建姓名 + 个人 PID 双索引（商户导入匹配用） */
export async function buildUserLookupIndexes(): Promise<UserLookupIndexes> {
  const [users, identities] = await Promise.all([
    db.user.findMany({ where: { status: "ACTIVE" } }),
    db.salesPlatformIdentity.findMany({
      include: { user: true },
    }),
  ]);

  const byName: UserLookupMap = new Map();
  const byManagerName: UserLookupMap = new Map();
  const byPersonalPid = new Map<string, User>();

  for (const user of users) {
    byName.set(normalizeName(user.name), user);
    for (const alias of user.aliases) {
      if (alias.trim()) {
        byName.set(normalizeName(alias), user);
      }
    }
    if (user.role === "MANAGER") {
      byManagerName.set(normalizeName(user.name), user);
      for (const alias of user.aliases) {
        if (alias.trim()) {
          byManagerName.set(normalizeName(alias), user);
        }
      }
    }
  }

  for (const identity of identities) {
    if (identity.user.status !== "ACTIVE") continue;
    byName.set(normalizeName(identity.jobAccountName), identity.user);
    if (identity.personalPid.trim()) {
      byPersonalPid.set(normalizePid(identity.personalPid), identity.user);
    }
  }

  return { byName, byManagerName, byPersonalPid };
}

/** @deprecated 使用 buildUserLookupIndexes */
export async function buildUserLookupMap(): Promise<UserLookupMap> {
  const indexes = await buildUserLookupIndexes();
  return indexes.byName;
}

export async function findUserBySalesIdentity(
  salesUserName: string,
  salesEmployeePid?: string | null
): Promise<User | null> {
  const indexes = await buildUserLookupIndexes();
  return findUserInIndexes(indexes, salesUserName, salesEmployeePid);
}
