import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { xlvChannelLabel } from "@/lib/xlv-channel";
import { XLV_INVENTORY_MANAGER_LABEL, xlvManagerDisplayName } from "@/lib/xlv-rules";
import { xlvCalendarDayRange } from "@/lib/xlv-stat-date";
import { withXlvBoardCache } from "@/services/xlv/board-cache";
import {
  assertCanViewXlv,
  buildXlvOperationalDeviceWhere,
  buildXlvRoleWhere,
} from "@/services/xlv/xlv-scope";

export type XlvPeriodBreakdownGroup = "manager" | "operator";

export type XlvPeriodBreakdownRow = {
  name: string;
  installed: number;
  qualified: number;
  fubei: number;
  leshua: number;
};

export type XlvPeriodBreakdown = {
  groupBy: XlvPeriodBreakdownGroup;
  rows: XlvPeriodBreakdownRow[];
};

const UNASSIGNED_OPERATOR = "未挂队员";

function breakdownGroup(
  user: SessionUser,
  managerName: string | null
): XlvPeriodBreakdownGroup {
  if (user.role === "DIRECTOR" && !managerName) return "manager";
  return "operator";
}

function rowName(
  groupBy: XlvPeriodBreakdownGroup,
  device: { managerName: string; operatorName: string }
) {
  if (groupBy === "manager") return xlvManagerDisplayName(device.managerName);
  const operator = device.operatorName.trim();
  return operator || UNASSIGNED_OPERATOR;
}

async function computeXlvPeriodBreakdown(
  user: SessionUser,
  dateFrom: string,
  dateTo: string,
  managerName: string | null
): Promise<XlvPeriodBreakdown> {
  assertCanViewXlv(user);
  const groupBy = breakdownGroup(user, managerName);
  if (user.role === "SALES" || managerName === XLV_INVENTORY_MANAGER_LABEL) {
    return { groupBy, rows: [] };
  }

  const { from, to } = xlvCalendarDayRange(dateFrom, dateTo);
  const where = {
    AND: [
      buildXlvRoleWhere(user),
      buildXlvOperationalDeviceWhere(),
      { firstTxnDate: { gte: from, lte: to } },
      ...(managerName ? [{ managerName }] : []),
    ],
  };
  const devices = await db.xlvDeviceRecord.findMany({
    where,
    select: {
      managerName: true,
      operatorName: true,
      channel: true,
      qualificationStatus: true,
    },
  });

  const map = new Map<string, XlvPeriodBreakdownRow>();
  for (const device of devices) {
    const name = rowName(groupBy, device);
    if (name === XLV_INVENTORY_MANAGER_LABEL) continue;
    const row = map.get(name) ?? {
      name,
      installed: 0,
      qualified: 0,
      fubei: 0,
      leshua: 0,
    };
    row.installed += 1;
    if (device.qualificationStatus === "qualified") {
      row.qualified += 1;
      const channel = xlvChannelLabel(device.channel);
      if (channel === "付呗") row.fubei += 1;
      else if (channel === "乐刷") row.leshua += 1;
    }
    map.set(name, row);
  }

  const rows = [...map.values()].sort((a, b) => {
    if (a.name === UNASSIGNED_OPERATOR) return 1;
    if (b.name === UNASSIGNED_OPERATOR) return -1;
    return (
      b.qualified - a.qualified ||
      b.installed - a.installed ||
      a.name.localeCompare(b.name, "zh-CN")
    );
  });

  return { groupBy, rows };
}

export async function loadXlvPeriodBreakdown(
  user: SessionUser,
  opts: { dateFrom: string; dateTo: string; managerName?: string | null }
): Promise<XlvPeriodBreakdown> {
  const managerName =
    user.role === "DIRECTOR" ? opts.managerName?.trim() || null : null;
  const key = [
    "period-breakdown-v1",
    user.id,
    user.role,
    user.xlvManagerName ?? "",
    user.name,
    opts.dateFrom,
    opts.dateTo,
    managerName ?? "",
  ].join(":");
  return withXlvBoardCache(key, () =>
    computeXlvPeriodBreakdown(user, opts.dateFrom, opts.dateTo, managerName)
  );
}
