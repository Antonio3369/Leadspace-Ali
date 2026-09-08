import { XLV_COMPLIANCE_TARGET_RATE } from "@/lib/xlv-rules";

/** 与 XlvBoardRow 结构一致，避免与 board.ts 循环依赖 */
export type XlvStaffBoardMergeRow = {
  key: string;
  name: string;
  userId: string | null;
  deviceCount: number;
  qualifiedCount: number;
  inProgressCount: number;
  invalidCount: number;
  dormantCount: number;
  singleSilenceCount: number;
  pendingFollowUpCount: number;
  monthFollowUpCount: number;
  monthWakeUpCount: number;
  monthWakeUpRate: number;
  compliantCount: number;
  complianceRate: number;
  complianceGapCount: number;
  toleranceRemainingCount: number;
};

function recomputeBoardRowRates(row: XlvStaffBoardMergeRow) {
  row.monthWakeUpRate =
    row.monthFollowUpCount > 0
      ? Math.round((row.monthWakeUpCount / row.monthFollowUpCount) * 1000) / 10
      : 0;
  const requiredCompliantCount = Math.ceil(
    row.deviceCount * (XLV_COMPLIANCE_TARGET_RATE / 100)
  );
  row.complianceRate =
    row.deviceCount > 0
      ? Math.round((row.compliantCount / row.deviceCount) * 1000) / 10
      : 0;
  row.complianceGapCount = Math.max(
    0,
    requiredCompliantCount - row.compliantCount
  );
  row.toleranceRemainingCount = Math.max(
    0,
    row.compliantCount - requiredCompliantCount
  );
}

function absorbStaffBoardRow(
  target: XlvStaffBoardMergeRow,
  src: XlvStaffBoardMergeRow
) {
  target.deviceCount += src.deviceCount;
  target.qualifiedCount += src.qualifiedCount;
  target.inProgressCount += src.inProgressCount;
  target.invalidCount += src.invalidCount;
  target.dormantCount += src.dormantCount;
  target.singleSilenceCount += src.singleSilenceCount;
  target.pendingFollowUpCount += src.pendingFollowUpCount;
  target.monthFollowUpCount += src.monthFollowUpCount;
  target.monthWakeUpCount += src.monthWakeUpCount;
  target.compliantCount += src.compliantCount;
  recomputeBoardRowRates(target);
}

/**
 * 作业员账号行与「仅姓名、未绑 salesUserId」行合并。
 * 队员设备页按 userId 会同时查出同名未绑定设备，排行若拆成两行就会出现「沉睡 0」点进去却有沉睡台数。
 */
export function mergeXlvStaffBoardIdentityRows<T extends XlvStaffBoardMergeRow>(
  rows: T[],
  userNamesById: Map<string, string>
): T[] {
  const byKey = new Map(rows.map((row) => [row.key, { ...row } as T]));
  const hostKeyByNameKey = new Map<string, string>();

  for (const row of byKey.values()) {
    if (row.key.startsWith("name:")) continue;
    const names = new Set<string>();
    if (row.name.trim()) names.add(row.name.trim());
    const accountName = userNamesById.get(row.key)?.trim();
    if (accountName) names.add(accountName);
    for (const name of names) {
      hostKeyByNameKey.set(`name:${name}`, row.key);
    }
  }

  for (const row of [...byKey.values()]) {
    if (!row.key.startsWith("name:")) continue;
    const hostKey = hostKeyByNameKey.get(row.key);
    if (!hostKey) continue;
    const host = byKey.get(hostKey);
    if (!host) continue;
    absorbStaffBoardRow(host, row);
    byKey.delete(row.key);
  }

  return [...byKey.values()];
}
