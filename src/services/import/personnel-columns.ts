/** 人员名单 Excel 列名（兼容小蓝环表与 N7「支付宝N7作业人员名单」） */
const COLUMN_ALIASES = {
  accountName: [
    "员工名称",
    "作业账号名称（姓名）",
    "作业员（姓名）",
    "作业员姓名",
    "作业人员",
  ],
  personalPid: [
    "员工id",
    "员工ID",
    "对应的PID",
    "uid",
    "UID",
    "作业员ID",
    "作业员id",
  ],
  managerName: ["所属经理", "所属经理（姓名）", "经理姓名"],
  salesAlias: ["对应的业务员名字"],
  memberName: ["对应PID所属队员姓名"],
  companyName: ["公司名称", "使用后台", "所属公司"],
} as const;

function pickField(row: Record<string, string>, aliases: readonly string[]): string {
  for (const key of aliases) {
    const v = String(row[key] ?? "").trim();
    if (v) return v;
  }
  for (const key of Object.keys(row)) {
    if (aliases.some((a) => a === key.trim())) {
      const v = String(row[key] ?? "").trim();
      if (v) return v;
    }
  }
  return "";
}

export function getPersonnelAccountName(row: Record<string, string>): string {
  return pickField(row, COLUMN_ALIASES.accountName);
}

export function getPersonnelPersonalPid(row: Record<string, string>): string {
  return pickField(row, COLUMN_ALIASES.personalPid);
}

export function getPersonnelManagerName(row: Record<string, string>): string {
  return pickField(row, COLUMN_ALIASES.managerName);
}

export function getPersonnelCompanyName(row: Record<string, string>): string {
  return pickField(row, COLUMN_ALIASES.companyName) || "业务区域";
}

export function getPersonnelAliases(row: Record<string, string>, accountName: string): string[] {
  const salesName = pickField(row, COLUMN_ALIASES.salesAlias) || accountName;
  const memberName = pickField(row, COLUMN_ALIASES.memberName);
  return [salesName, memberName].filter((a) => a && a !== accountName);
}

/** 判断该表是否像人员名单（用于多 sheet 文件选表） */
export function looksLikePersonnelSheet(rows: Record<string, string>[]): boolean {
  const sample = rows.slice(0, 8);
  if (sample.length === 0) return false;
  let hits = 0;
  for (const row of sample) {
    if (getPersonnelAccountName(row)) hits += 1;
  }
  return hits >= Math.min(2, sample.length);
}
