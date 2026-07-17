import * as XLSX from "xlsx";
import fs from "fs";
import bcrypt from "bcryptjs";
import type { AccountLifecycle, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { IMPORTED_USER_DEFAULTS } from "@/lib/account-lifecycle";
import { chineseNameToPinyinUsername } from "@/lib/pinyin-username";
import {
  getPersonnelAccountName,
  getPersonnelAliases,
  getPersonnelCompanyName,
  getPersonnelManagerName,
  getPersonnelPersonalPid,
  looksLikePersonnelSheet,
} from "@/services/import/personnel-columns";

export interface PersonnelImportResult {
  managersCreated: number;
  salesCreated: number;
  teamsCreated: number;
  identitiesUpserted: number;
}

function slugUsername(prefix: string, name: string, index: number): string {
  const base = name.replace(/[^\w\u4e00-\u9fff]/g, "").slice(0, 20) || `user${index}`;
  return `${prefix}_${base}_${index}`;
}

async function allocateManagerUsername(name: string, excludeUserId?: string): Promise<string> {
  const base = chineseNameToPinyinUsername(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const conflict = await db.user.findFirst({
      where: {
        username: candidate,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (!conflict) return candidate;
    candidate = `${base}${suffix++}`;
  }
}

/** 将已有经理账号统一为姓名拼音 */
export async function syncAllManagerPinyinUsernames() {
  const managers = await db.user.findMany({
    where: { role: "MANAGER" },
    orderBy: { name: "asc" },
  });

  for (const mgr of managers) {
    const username = await allocateManagerUsername(mgr.name, mgr.id);
    if (username !== mgr.username) {
      await db.user.update({
        where: { id: mgr.id },
        data: { username },
      });
    }
  }
}

/** Excel 导入更新时：已开通账号不覆盖密码与生命周期 */
function preserveEnabledAccount(
  existing: Pick<User, "accountLifecycle" | "passwordHash"> | null
) {
  if (
    existing &&
    existing.passwordHash &&
    (existing.accountLifecycle === "PENDING_ONBOARDING" || existing.accountLifecycle === "ACTIVE")
  ) {
    return {
      passwordHash: existing.passwordHash,
      accountLifecycle: existing.accountLifecycle as AccountLifecycle,
    };
  }
  return IMPORTED_USER_DEFAULTS;
}

async function upsertSalesPlatformIdentity(
  userId: string,
  accountName: string,
  personalPid: string
): Promise<boolean> {
  const pid = personalPid.trim();
  if (!pid) return false;

  const byPid = await db.salesPlatformIdentity.findFirst({
    where: { personalPid: pid },
  });
  if (byPid) {
    if (byPid.userId !== userId) {
      await db.salesPlatformIdentity.update({
        where: { id: byPid.id },
        data: { userId },
      });
    }
    return true;
  }

  let jobAccountName = accountName;
  const nameTaken = await db.salesPlatformIdentity.findUnique({
    where: { jobAccountName },
  });
  if (nameTaken) {
    jobAccountName = `${accountName}__${pid.slice(-8)}`;
  }

  await db.salesPlatformIdentity.create({
    data: { userId, jobAccountName, personalPid: pid },
  });
  return true;
}

async function findOrCreateSalesUser(
  accountName: string,
  mgrName: string,
  managerMap: Map<string, string>,
  salesIdx: { value: number },
  aliases: string[]
): Promise<{ userId: string; created: boolean }> {
  const managerId = mgrName ? managerMap.get(mgrName) : undefined;
  const teamId = managerId
    ? (await db.user.findUnique({ where: { id: managerId }, select: { teamId: true } }))?.teamId
    : undefined;

  const existing = await db.user.findFirst({
    where: {
      name: accountName,
      role: "SALES",
      managerId: managerId ?? null,
    },
  });
  const accountFields = preserveEnabledAccount(existing);

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: accountName,
        aliases,
        managerId,
        teamId: teamId ?? undefined,
        ...accountFields,
      },
    });
    return { userId: existing.id, created: false };
  }

  const user = await db.user.create({
    data: {
      username: slugUsername("sales", accountName, salesIdx.value++),
      name: accountName,
      aliases,
      role: "SALES",
      status: "ACTIVE",
      managerId,
      teamId: teamId ?? undefined,
      ...IMPORTED_USER_DEFAULTS,
    },
  });
  return { userId: user.id, created: true };
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): Record<string, string>[] {
  return XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[sheetName]!, {
    defval: "",
  });
}

/** 从「付呗作业员名单」等附表按姓名补齐 uid/PID */
function buildPidByNameLookup(wb: XLSX.WorkBook): Map<string, string> {
  const map = new Map<string, string>();
  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb, sheetName);
    if (rows.length === 0) continue;
    for (const row of rows) {
      const name = getPersonnelAccountName(row);
      const pid = getPersonnelPersonalPid(row);
      if (name && pid && !map.has(name)) {
        map.set(name, pid);
      }
    }
  }
  return map;
}

function pickPersonnelRows(wb: XLSX.WorkBook): Record<string, string>[] {
  // 优先 N7 主表；否则选第一张能识别出姓名列的表
  const preferred = ["N7作业名单", "作业名单", "人员名单"];
  for (const name of preferred) {
    if (wb.SheetNames.includes(name)) {
      const rows = sheetToRows(wb, name);
      if (looksLikePersonnelSheet(rows)) return rows;
    }
  }
  for (const name of wb.SheetNames) {
    const rows = sheetToRows(wb, name);
    if (looksLikePersonnelSheet(rows)) return rows;
  }
  return sheetToRows(wb, wb.SheetNames[0]!);
}

export async function importPersonnelFromBuffer(buffer: Buffer): Promise<PersonnelImportResult> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (wb.SheetNames.length === 0) {
    throw new Error("人员名单 Excel 无工作表");
  }

  const rows = pickPersonnelRows(wb);
  if (rows.length === 0) {
    throw new Error("人员名单 Excel 无有效数据");
  }

  const pidByName = buildPidByNameLookup(wb);
  return importPersonnelRows(rows, pidByName);
}

async function importPersonnelRows(
  rows: Record<string, string>[],
  pidByName: Map<string, string> = new Map()
): Promise<PersonnelImportResult> {
  const division = await db.orgUnit.upsert({
    where: { id: "div-leadspace" },
    create: { id: "div-leadspace", name: "Leadspace 事业部", type: "DIVISION" },
    update: {},
  });

  const companyName = getPersonnelCompanyName(rows[0] ?? {});
  const region = await db.orgUnit.upsert({
    where: { id: "region-main" },
    create: {
      id: "region-main",
      name: companyName,
      type: "REGION",
      parentId: division.id,
    },
    update: { name: companyName },
  });

  const managerNames = [
    ...new Set(rows.map((r) => getPersonnelManagerName(r)).filter(Boolean)),
  ];

  if (managerNames.length === 0 && !rows.some((r) => getPersonnelAccountName(r))) {
    throw new Error(
      "未识别到人员列。请使用含「作业员（姓名）/员工名称」与「所属经理」的名单表（如 N7作业名单）。"
    );
  }

  const managerMap = new Map<string, string>();
  let managersCreated = 0;
  let teamsCreated = 0;

  for (let i = 0; i < managerNames.length; i++) {
    const mgrName = managerNames[i]!;
    const teamId = `team-${chineseNameToPinyinUsername(mgrName)}`;
    await db.orgUnit.upsert({
      where: { id: teamId },
      create: {
        id: teamId,
        name: `${mgrName}团队`,
        type: "TEAM",
        parentId: region.id,
      },
      update: { name: `${mgrName}团队` },
    });
    teamsCreated++;

    const existing = await db.user.findFirst({
      where: { name: mgrName, role: "MANAGER" },
    });
    const username = await allocateManagerUsername(mgrName, existing?.id);
    const accountFields = preserveEnabledAccount(existing);

    const manager = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: {
            username,
            name: mgrName,
            teamId,
            status: "ACTIVE",
            ...accountFields,
          },
        })
      : await db.user.create({
          data: {
            username,
            name: mgrName,
            role: "MANAGER",
            status: "ACTIVE",
            teamId,
            ...IMPORTED_USER_DEFAULTS,
          },
        });

    managerMap.set(mgrName, manager.id);
    managersCreated++;
  }

  await syncAllManagerPinyinUsernames();

  const seenUsers = new Set<string>();
  let salesCreated = 0;
  let identitiesUpserted = 0;
  const salesIdx = { value: 0 };

  for (const row of rows) {
    const accountName = getPersonnelAccountName(row);
    if (!accountName) continue;

    // N7 主表常无员工 id：允许仅按姓名建号；有附表 uid 时自动补齐
    const personalPid =
      getPersonnelPersonalPid(row) || pidByName.get(accountName) || "";

    const mgrName = getPersonnelManagerName(row);
    const aliases = getPersonnelAliases(row, accountName);

    const userKey = `${mgrName}::${accountName}`;
    let userId: string;

    if (seenUsers.has(userKey)) {
      const existing = await db.user.findFirst({
        where: {
          name: accountName,
          role: "SALES",
          managerId: mgrName ? (managerMap.get(mgrName) ?? null) : null,
        },
        select: { id: true },
      });
      if (!existing) continue;
      userId = existing.id;
    } else {
      const result = await findOrCreateSalesUser(
        accountName,
        mgrName,
        managerMap,
        salesIdx,
        aliases
      );
      userId = result.userId;
      seenUsers.add(userKey);
      if (result.created) salesCreated++;
    }

    if (
      personalPid &&
      (await upsertSalesPlatformIdentity(userId, accountName, personalPid))
    ) {
      identitiesUpserted++;
    }
  }

  return { managersCreated, salesCreated, teamsCreated, identitiesUpserted };
}

export async function importPersonnelFromFile(
  filePath: string,
  _defaultPassword = "123456"
): Promise<PersonnelImportResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`人员名单文件不存在: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  return importPersonnelFromBuffer(buffer);
}

/** 确保管理员账号 admin 存在；历史 Antonio 会自动改名为 admin（不重置密码） */
export async function ensureAdminDirector(defaultPassword = "123456") {
  const admin = await db.user.findUnique({
    where: { username: "admin" },
    select: { id: true },
  });
  if (admin) {
    return db.user.update({
      where: { id: admin.id },
      data: {
        name: "admin",
        role: "DIRECTOR",
        status: "ACTIVE",
        accountLifecycle: "ACTIVE",
      },
    });
  }

  const legacy = await db.user.findUnique({
    where: { username: "Antonio" },
    select: { id: true },
  });
  if (legacy) {
    return db.user.update({
      where: { id: legacy.id },
      data: {
        username: "admin",
        name: "admin",
        role: "DIRECTOR",
        status: "ACTIVE",
        accountLifecycle: "ACTIVE",
      },
    });
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  return db.user.create({
    data: {
      username: "admin",
      passwordHash,
      name: "admin",
      role: "DIRECTOR",
      status: "ACTIVE",
      accountLifecycle: "ACTIVE",
      mustChangePassword: false,
    },
  });
}

/** @deprecated 使用 ensureAdminDirector */
export const ensureAntonioDirector = ensureAdminDirector;
