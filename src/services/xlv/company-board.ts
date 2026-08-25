import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  XLV_UNASSIGNED_COMPANY_KEY,
  XLV_UNASSIGNED_COMPANY_LABEL,
  isXlvCompanyBoardTailRow,
  type XlvCompanyBoardResult,
  type XlvCompanyBoardRow,
} from "@/lib/xlv-company-board";
import { getCurrentMonthRange } from "@/lib/n7-date";
import { detectXlvWakeUpDate } from "@/lib/xlv-wake-up";
import {
  isXlvDeviceCompliant,
  isXlvPlaceholderName,
  type XlvQualificationStatus,
  XLV_COMPLIANCE_TARGET_RATE,
  xlvEffectiveAlertKind,
} from "@/lib/xlv-rules";
import { loadXlvSnapshotMapAfterFollowUp } from "@/services/xlv/assessment";
import { withXlvBoardCache } from "./board-cache";
import { withXlvHeavyGate } from "./xlv-heavy-gate";
import { buildXlvOperationalDeviceWhere } from "./xlv-scope";
import { loadXlvCanonicalCompanyNames } from "./roster";

export type { XlvCompanyBoardResult, XlvCompanyBoardRow } from "@/lib/xlv-company-board";
export {
  XLV_UNASSIGNED_COMPANY_KEY,
  XLV_UNASSIGNED_COMPANY_LABEL,
  isXlvCompanyBoardTailRow,
} from "@/lib/xlv-company-board";

const COMPANY_BOARD_SELECT = {
  deviceSn: true,
  companyName: true,
  managerName: true,
  sleepDays: true,
  cumulativeTxns: true,
  firstTxnDate: true,
  qualificationStatus: true,
  followUpDone: true,
  followUpAt: true,
  lastTxnDate: true,
  statDate: true,
} as const;

type CompanyBoardDeviceRow = {
  deviceSn: string;
  companyName: string | null;
  managerName: string;
  sleepDays: number;
  cumulativeTxns: number;
  firstTxnDate: Date | null;
  qualificationStatus: XlvQualificationStatus;
  followUpDone: boolean;
  followUpAt: Date | null;
  lastTxnDate: Date | null;
  statDate: Date | null;
};

const BATCH_SIZE = 800;

function companyKeyOf(d: CompanyBoardDeviceRow): string {
  const name = d.companyName?.trim();
  if (!name || isXlvPlaceholderName(name)) return XLV_UNASSIGNED_COMPANY_KEY;
  return name;
}

function companyDisplayName(key: string): string {
  return key === XLV_UNASSIGNED_COMPANY_KEY
    ? XLV_UNASSIGNED_COMPANY_LABEL
    : key;
}

function emptyCompanyRow(key: string): XlvCompanyBoardRow {
  return {
    key,
    name: companyDisplayName(key),
    deployedCount: 0,
    monthExpandCount: 0,
    inProgressCount: 0,
    singleSilenceCount: 0,
    dormantCount: 0,
    compliantCount: 0,
    complianceRate: 0,
    monthWakeUpRate: 0,
    monthFollowUpCount: 0,
    monthWakeUpCount: 0,
  };
}

function finalizeCompanyRow(row: XlvCompanyBoardRow) {
  row.monthWakeUpRate =
    row.monthFollowUpCount > 0
      ? Math.round((row.monthWakeUpCount / row.monthFollowUpCount) * 1000) / 10
      : 0;
  row.complianceRate =
    row.deployedCount > 0
      ? Math.round((row.compliantCount / row.deployedCount) * 1000) / 10
      : 0;
}

function isCompanyBoardTailRow(row: XlvCompanyBoardRow): boolean {
  return isXlvCompanyBoardTailRow(row);
}

function sortCompanyRows(rows: XlvCompanyBoardRow[]): XlvCompanyBoardRow[] {
  return rows.sort((a, b) => {
    const aTail = isCompanyBoardTailRow(a);
    const bTail = isCompanyBoardTailRow(b);
    if (aTail !== bTail) return aTail ? 1 : -1;
    if (aTail && bTail) {
      if (a.key === XLV_UNASSIGNED_COMPANY_KEY) return 1;
      if (b.key === XLV_UNASSIGNED_COMPANY_KEY) return -1;
      return a.name.localeCompare(b.name, "zh-CN");
    }
    return (
      b.dormantCount - a.dormantCount ||
      b.singleSilenceCount - a.singleSilenceCount ||
      b.deployedCount - a.deployedCount ||
      a.name.localeCompare(b.name, "zh-CN")
    );
  });
}

async function aggregateCompanyBoard(
  where: Prisma.XlvDeviceRecordWhereInput
): Promise<{
  map: Map<string, XlvCompanyBoardRow>;
  monthFollowed: CompanyBoardDeviceRow[];
  totals: {
    deployedCount: number;
    monthExpandCount: number;
    inProgressCount: number;
    singleSilenceCount: number;
    dormantCount: number;
    compliantCount: number;
    monthFollowUpCount: number;
    monthWakeUpCount: number;
  };
}> {
  const map = new Map<string, XlvCompanyBoardRow>();
  const monthFollowed: CompanyBoardDeviceRow[] = [];
  const { from: monthFrom, to: monthTo } = getCurrentMonthRange();
  const totals = {
    deployedCount: 0,
    monthExpandCount: 0,
    inProgressCount: 0,
    singleSilenceCount: 0,
    dormantCount: 0,
    compliantCount: 0,
    monthFollowUpCount: 0,
    monthWakeUpCount: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const batch = await db.xlvDeviceRecord.findMany({
      where,
      select: COMPANY_BOARD_SELECT,
      take: BATCH_SIZE,
      orderBy: { deviceSn: "asc" },
      ...(cursor ? { skip: 1, cursor: { deviceSn: cursor } } : {}),
    });
    if (batch.length === 0) break;

    for (const raw of batch) {
      const d = raw as CompanyBoardDeviceRow;

      const key = companyKeyOf(d);
      let row = map.get(key);
      if (!row) {
        row = emptyCompanyRow(key);
        map.set(key, row);
      }

      row.deployedCount += 1;
      totals.deployedCount += 1;

      if (
        d.firstTxnDate &&
        d.firstTxnDate >= monthFrom &&
        d.firstTxnDate <= monthTo
      ) {
        row.monthExpandCount += 1;
        totals.monthExpandCount += 1;
      }

      if (isXlvDeviceCompliant(d)) {
        row.compliantCount += 1;
        totals.compliantCount += 1;
      }

      if (d.qualificationStatus === "in_progress") {
        row.inProgressCount += 1;
        totals.inProgressCount += 1;
      }

      const alert = xlvEffectiveAlertKind(d);
      if (alert === "dormant") {
        row.dormantCount += 1;
        totals.dormantCount += 1;
      }
      if (alert === "single_silence") {
        row.singleSilenceCount += 1;
        totals.singleSilenceCount += 1;
      }

      if (
        d.followUpAt &&
        d.followUpAt >= monthFrom &&
        d.followUpAt <= monthTo
      ) {
        row.monthFollowUpCount += 1;
        totals.monthFollowUpCount += 1;
        monthFollowed.push(d);
      }
    }

    cursor = batch[batch.length - 1]!.deviceSn;
    if (batch.length < BATCH_SIZE) break;
  }

  if (monthFollowed.length > 0) {
    const snapshotMap = await loadXlvSnapshotMapAfterFollowUp(monthFollowed);
    for (const d of monthFollowed) {
      const wakeUpDate = detectXlvWakeUpDate(
        d,
        d.followUpAt!,
        snapshotMap.get(d.deviceSn) ?? []
      );
      if (wakeUpDate) {
        map.get(companyKeyOf(d))!.monthWakeUpCount += 1;
        totals.monthWakeUpCount += 1;
      }
    }
  }

  for (const row of map.values()) {
    finalizeCompanyRow(row);
  }

  return { map, monthFollowed, totals };
}

/** Admin · 按分公司汇总（口径对齐团队看板 + 设备页六宫格） */
export async function getXlvCompanyBoard(): Promise<XlvCompanyBoardResult> {
  return withXlvBoardCache("company:all", () =>
    withXlvHeavyGate(async () => {
      const where = { AND: [buildXlvOperationalDeviceWhere()] };
      const [canonicalNames, latest, agg] = await Promise.all([
        loadXlvCanonicalCompanyNames(),
        db.xlvDeviceRecord.findFirst({
          where: { AND: [where, { lastTxnDate: { not: null } }] },
          orderBy: { lastTxnDate: "desc" },
          select: { lastTxnDate: true },
        }),
        aggregateCompanyBoard(where),
      ]);

      const { map, totals } = agg;

      for (const name of canonicalNames) {
        if (!map.has(name)) {
          map.set(name, emptyCompanyRow(name));
        }
      }

      const rows = sortCompanyRows([...map.values()]);
      const tailRows = rows.filter(isCompanyBoardTailRow);
      const listedCompanies = rows.filter((r) => !isCompanyBoardTailRow(r));
      const unassignedRow = tailRows.find(
        (r) => r.key === XLV_UNASSIGNED_COMPANY_KEY
      );

      const complianceRate =
        totals.deployedCount > 0
          ? Math.round((totals.compliantCount / totals.deployedCount) * 1000) /
            10
          : 0;
      const monthWakeUpRate =
        totals.monthFollowUpCount > 0
          ? Math.round(
              (totals.monthWakeUpCount / totals.monthFollowUpCount) * 1000
            ) / 10
          : 0;

      return {
        rows: listedCompanies.concat(tailRows),
        summary: {
          companyCount: canonicalNames.length,
          deployedCount: totals.deployedCount,
          monthExpandCount: totals.monthExpandCount,
          inProgressCount: totals.inProgressCount,
          singleSilenceCount: totals.singleSilenceCount,
          dormantCount: totals.dormantCount,
          complianceRate,
          monthWakeUpRate,
          dataDate: latest?.lastTxnDate
            ? latest.lastTxnDate.toISOString().slice(0, 10)
            : null,
          unassignedDeployedCount: unassignedRow?.deployedCount ?? 0,
          compliantCount: totals.compliantCount,
        },
      };
    })
  );
}
