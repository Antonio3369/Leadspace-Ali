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

export async function importPersonnelFromBuffer(buffer: Buffer): Promise<PersonnelImportResult> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]!], {
    defval: "",
  });

  if (rows.length === 0) {
    throw new Error("人员名单 Excel 无有效数据");
  }

  return importPersonnelRows(rows);
}

async function importPersonnelRows(
  rows: Record<string, string>[]
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
    const personalPid = getPersonnelPersonalPid(row);
    if (!accountName || !personalPid) continue;

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

    if (await upsertSalesPlatformIdentity(userId, accountName, personalPid)) {
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

export async function ensureAntonioDirector(defaultPassword = "123456") {
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  return db.user.upsert({
    where: { username: "Antonio" },
    create: {
      username: "Antonio",
      passwordHash,
      name: "Antonio",
      role: "DIRECTOR",
      status: "ACTIVE",
      accountLifecycle: "ACTIVE",
      mustChangePassword: false,
    },
    update: {
      passwordHash,
      name: "Antonio",
      role: "DIRECTOR",
      accountLifecycle: "ACTIVE",
      mustChangePassword: false,
    },
  });
}
