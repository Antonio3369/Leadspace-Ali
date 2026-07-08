import type { User } from "@/generated/prisma/client";
import {
  getPersonnelAccountName,
  getPersonnelManagerName,
  getPersonnelPersonalPid,
} from "@/services/import/personnel-columns";

export type UserLookupMap = Map<string, User>;

export interface UserLookupIndexes {
  byName: UserLookupMap;
  byPersonalPid: Map<string, User>;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizePid(pid: string): string {
  return pid.trim();
}

export function findUserInIndexes(
  indexes: UserLookupIndexes,
  salesUserName: string,
  salesEmployeePid?: string | null
): User | null {
  const pid = salesEmployeePid?.trim();
  if (pid) {
    const byPid = indexes.byPersonalPid.get(normalizePid(pid));
    if (byPid) return byPid;
  }
  return indexes.byName.get(normalizeName(salesUserName)) ?? null;
}

/** 从人员名单 Excel 行构建内存索引（分析脚本用） */
export function buildPersonnelLookupFromRows(
  rows: Record<string, string>[]
): UserLookupIndexes {
  const byName: UserLookupMap = new Map();
  const byPersonalPid = new Map<string, User>();

  const stub = (name: string, manager: string): User =>
    ({
      id: `stub:${manager}:${name}`,
      name,
      role: "SALES",
      status: "ACTIVE",
      teamId: null,
      managerId: null,
    }) as User;

  for (const row of rows) {
    const accountName = getPersonnelAccountName(row);
    const personalPid = getPersonnelPersonalPid(row);
    const mgrName = getPersonnelManagerName(row);
    if (!accountName || !personalPid) continue;

    const user = stub(accountName, mgrName);
    byPersonalPid.set(normalizePid(personalPid), user);
    byName.set(normalizeName(accountName), user);
  }

  return { byName, byPersonalPid };
}

export function findUserInMap(
  map: UserLookupMap,
  salesUserName: string,
  salesEmployeePid?: string | null,
  pidMap?: Map<string, User>
): User | null {
  const pid = salesEmployeePid?.trim();
  if (pid && pidMap?.has(normalizePid(pid))) {
    return pidMap.get(normalizePid(pid))!;
  }
  return map.get(normalizeName(salesUserName)) ?? null;
}
