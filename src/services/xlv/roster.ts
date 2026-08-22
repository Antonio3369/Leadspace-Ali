import { db } from "@/lib/db";
import { isXlvPlaceholderName } from "@/lib/xlv-rules";

export type XlvRosterEntry = {
  operatorName: string;
  managerName: string;
  companyName: string | null;
  managerUserId: string | null;
  salesUserId: string | null;
};

export async function loadXlvRosterEntries(): Promise<XlvRosterEntry[]> {
  return db.xlvTeamRoster.findMany({
    select: {
      operatorName: true,
      managerName: true,
      companyName: true,
      managerUserId: true,
      salesUserId: true,
    },
    orderBy: [{ operatorName: "asc" }, { managerName: "asc" }],
  });
}

export function buildXlvRosterIndex(entries: XlvRosterEntry[]) {
  const byOperator = new Map<string, XlvRosterEntry[]>();
  for (const entry of entries) {
    const key = entry.operatorName.trim();
    if (!key) continue;
    const list = byOperator.get(key) ?? [];
    list.push(entry);
    byOperator.set(key, list);
  }
  return byOperator;
}

/** 从名册按作业员反查经理；多名册冲突时需文件内自带经理 */
export function resolveXlvManagerFromRoster(
  byOperator: Map<string, XlvRosterEntry[]>,
  operatorName: string,
  managerHint?: string | null
): { managerName: string; companyName: string | null; ambiguous: boolean } | null {
  const key = operatorName.trim();
  if (!key) return null;
  const list = byOperator.get(key);
  if (!list?.length) return null;

  const hint = managerHint?.trim();
  if (hint) {
    const exact = list.find((e) => e.managerName.trim() === hint);
    if (exact) {
      return {
        managerName: exact.managerName,
        companyName: exact.companyName,
        ambiguous: false,
      };
    }
  }

  if (list.length === 1) {
    return {
      managerName: list[0]!.managerName,
      companyName: list[0]!.companyName,
      ambiguous: false,
    };
  }

  return { managerName: "", companyName: null, ambiguous: true };
}

export function buildXlvRosterPairSet(entries: XlvRosterEntry[]) {
  return new Set(
    entries.map((e) => `${e.managerName.trim()}::${e.operatorName.trim()}`)
  );
}

/** 组织名册中的分公司名单（去重、中文排序） */
export async function loadXlvCanonicalCompanyNames(): Promise<string[]> {
  const rows = await db.xlvTeamRoster.findMany({
    select: { companyName: true },
  });
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.companyName?.trim();
    if (name && !isXlvPlaceholderName(name)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "zh-CN"));
}
