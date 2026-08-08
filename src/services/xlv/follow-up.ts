import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import {
  classifyXlvAlert,
  classifyXlvTodayPriority,
  getXlvAssessmentDaysRemaining,
  type XlvAlertKind,
  type XlvTodayPriority,
  xlvQualificationGapLine,
} from "@/lib/xlv-rules";
import {
  assertCanViewXlv,
  buildXlvDeviceWhere,
  buildXlvRoleWhere,
  buildXlvSleepAlertWhere,
} from "@/services/xlv/xlv-scope";
import {
  attachXlvQualificationDetails,
  loadXlvSnapshotMap,
} from "@/services/xlv/assessment";
import { sortXlvDevices } from "@/services/xlv/sort-devices";
import type { XlvDeviceListItem } from "@/services/xlv/analytics";

export type XlvFollowFilter = "pending" | "done" | "all";

/** 与今日待办 P0/P1 对齐的回访筛选 */
export type XlvFollowUpPriority = Extract<XlvTodayPriority, "P0" | "P1">;

export type XlvFollowUpDeviceItem = XlvDeviceListItem & {
  followUpDone: boolean;
  followUpNote: string | null;
  followUpAt: string | null;
  followUpConnectStatus: string | null;
  followUpFlags: string[];
};

function isoDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

function buildFollowUpWhere(
  user: SessionUser,
  opts: {
    follow?: XlvFollowFilter;
    alert?: Exclude<XlvAlertKind, "all" | "active"> | "all";
    managerName?: string | null;
    operatorName?: string | null;
    search?: string | null;
  }
): Prisma.XlvDeviceRecordWhereInput {
  const parts: Prisma.XlvDeviceRecordWhereInput[] = [
    buildXlvSleepAlertWhere(),
  ];

  const follow = opts.follow ?? "pending";
  if (follow === "pending") {
    parts.push({ followUpDone: false });
  } else if (follow === "done") {
    parts.push({ followUpDone: true });
  }

  if (opts.alert === "single_silence") {
    parts.push({ cumulativeTxns: 1 });
  } else if (opts.alert === "dormant") {
    parts.push({ NOT: { cumulativeTxns: 1 } });
  }

  parts.push(
    buildXlvDeviceWhere(user, {
      managerName: opts.managerName,
      operatorName: opts.operatorName,
      search: opts.search,
    })
  );

  return { AND: parts };
}

export async function getXlvFollowUpCounts(user: SessionUser) {
  assertCanViewXlv(user);
  const base: Prisma.XlvDeviceRecordWhereInput = {
    AND: [buildXlvRoleWhere(user), buildXlvSleepAlertWhere()],
  };

  const [pending, done] = await Promise.all([
    db.xlvDeviceRecord.count({
      where: { AND: [...(base.AND as Prisma.XlvDeviceRecordWhereInput[]), { followUpDone: false }] },
    }),
    db.xlvDeviceRecord.count({
      where: { AND: [...(base.AND as Prisma.XlvDeviceRecordWhereInput[]), { followUpDone: true }] },
    }),
  ]);

  return { pending, done, all: pending + done };
}

export async function getXlvFollowUpDevices(
  user: SessionUser,
  opts: {
    follow?: XlvFollowFilter;
    alert?: Exclude<XlvAlertKind, "all" | "active"> | "all";
    priority?: XlvFollowUpPriority | null;
    managerName?: string | null;
    operatorName?: string | null;
    search?: string | null;
  }
) {
  assertCanViewXlv(user);
  const where = buildFollowUpWhere(user, opts);

  const rows = await db.xlvDeviceRecord.findMany({
    where,
    orderBy: { deviceSn: "asc" },
    select: {
      deviceSn: true,
      merchantName: true,
      activationMerchantName: true,
      operatorName: true,
      managerName: true,
      companyName: true,
      cumulativeUsers: true,
      cumulativeTxns: true,
      sleepDays: true,
      lastTxnDate: true,
      firstTxnDate: true,
      statDate: true,
      followUpDone: true,
      followUpNote: true,
      followUpAt: true,
      followUpConnectStatus: true,
      followUpFlags: true,
    },
  });

  const snapshotMap = await loadXlvSnapshotMap(rows.map((r) => r.deviceSn));
  const enriched = attachXlvQualificationDetails(rows, snapshotMap);
  const sorted = sortXlvDevices(enriched, "risk");

  const devices: XlvFollowUpDeviceItem[] = [];
  for (const row of sorted) {
    const snapshots = snapshotMap.get(row.deviceSn) ?? [];
    const asOf =
      row.statDate ??
      (snapshots.length ? snapshots[snapshots.length - 1]!.statDate : new Date());
    const assessmentDaysLeft = getXlvAssessmentDaysRemaining(
      row.firstTxnDate,
      asOf
    );
    const todayPriority = classifyXlvTodayPriority({
      sleepDays: row.sleepDays,
      cumulativeTxns: row.cumulativeTxns,
      followUpDone: row.followUpDone,
      qualificationStatus: row.qualificationStatus,
      firstTxnDate: row.firstTxnDate,
      assessmentDaysLeft,
    });
    if (opts.priority && todayPriority !== opts.priority) continue;

    const detail = row.qualificationDetail;
    devices.push({
      deviceSn: row.deviceSn,
      merchantName: row.merchantName,
      activationMerchantName: row.activationMerchantName,
      operatorName: row.operatorName,
      managerName: row.managerName,
      companyName: row.companyName,
      cumulativeUsers: row.cumulativeUsers,
      cumulativeTxns: row.cumulativeTxns,
      sleepDays: row.sleepDays,
      lastTxnDate: isoDate(row.lastTxnDate),
      firstTxnDate: isoDate(row.firstTxnDate),
      alertKind: classifyXlvAlert({
        sleepDays: row.sleepDays,
        cumulativeTxns: row.cumulativeTxns,
      }),
      qualificationStatus: row.qualificationStatus,
      qualificationGapLine: xlvQualificationGapLine(detail),
      followUpDone: row.followUpDone,
      followUpNote: row.followUpNote,
      followUpAt: row.followUpAt?.toISOString() ?? null,
      followUpConnectStatus: row.followUpConnectStatus,
      followUpFlags: row.followUpFlags ?? [],
    });
  }

  const counts = await getXlvFollowUpCounts(user);

  return {
    follow: opts.follow ?? "pending",
    priority: opts.priority ?? null,
    counts,
    devices,
  };
}

export async function updateXlvDeviceFollowUp(
  deviceSn: string,
  input: {
    followUpDone: boolean;
    followUpNote?: string | null;
    followUpById: string;
    followUpConnectStatus?: string | null;
    followUpFlags?: string[];
    followUpPhotoUrls?: string[];
  }
) {
  return db.xlvDeviceRecord.update({
    where: { deviceSn },
    data: {
      followUpDone: input.followUpDone,
      ...(input.followUpNote !== undefined
        ? { followUpNote: input.followUpNote?.trim() || null }
        : {}),
      followUpAt: input.followUpDone ? new Date() : null,
      followUpById: input.followUpDone ? input.followUpById : null,
      ...(input.followUpDone
        ? {
            followUpConnectStatus: input.followUpConnectStatus ?? null,
            followUpFlags: input.followUpFlags ?? [],
            followUpPhotoUrls: input.followUpPhotoUrls ?? [],
          }
        : {
            followUpConnectStatus: null,
            followUpFlags: [],
            followUpPhotoUrls: [],
          }),
    },
    select: {
      followUpDone: true,
      followUpNote: true,
      followUpAt: true,
      followUpConnectStatus: true,
      followUpFlags: true,
      followUpPhotoUrls: true,
    },
  });
}
