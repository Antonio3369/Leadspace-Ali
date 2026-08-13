import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { xlvStatDateKey } from "@/lib/xlv-stat-date";
import {
  classifyXlvAlert,
  classifyXlvTodayPriority,
  getXlvAssessmentDaysRemaining,
  type XlvAlertKind,
  type XlvTodayPriority,
  XLV_SLEEP_THRESHOLD_DAYS,
  xlvEffectiveAlertKind,
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

const REOPEN_LOOKUP_CHUNK = 800;

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

export function shouldReopenXlvFollowUp(input: {
  qualificationStatus: "qualified" | "in_progress" | "invalid";
  followUpDone: boolean;
  followUpAt: Date | null;
  statDate: Date | null;
  sleepDays: number;
  cumulativeTxns: number;
}) {
  if (
    input.qualificationStatus === "qualified" ||
    !input.followUpDone ||
    !input.followUpAt ||
    !input.statDate ||
    xlvStatDateKey(input.statDate) <= xlvStatDateKey(input.followUpAt)
  ) {
    return false;
  }
  return classifyXlvAlert(input) !== "active";
}

/**
 * 新运营快照仍显示风险时，上一轮跟进失效并重新进入待跟进。
 * 已达标设备已取得结算资格，不重开；保留旧跟进内容供回看，新跟进会覆盖当前记录。
 */
export async function reopenXlvFollowUpsAfterSnapshot(deviceSns: string[]) {
  const uniqueSns = [...new Set(deviceSns)];
  let reopened = 0;

  for (let i = 0; i < uniqueSns.length; i += REOPEN_LOOKUP_CHUNK) {
    const rows = await db.xlvDeviceRecord.findMany({
      where: {
        deviceSn: { in: uniqueSns.slice(i, i + REOPEN_LOOKUP_CHUNK) },
        followUpDone: true,
        followUpAt: { not: null },
        qualificationStatus: { not: "qualified" },
        sleepDays: { gte: XLV_SLEEP_THRESHOLD_DAYS },
      },
      select: {
        id: true,
        statDate: true,
        followUpAt: true,
        sleepDays: true,
        cumulativeTxns: true,
        qualificationStatus: true,
        followUpDone: true,
      },
    });

    const ids = rows
      .filter(shouldReopenXlvFollowUp)
      .map((row) => row.id);

    if (ids.length > 0) {
      const result = await db.xlvDeviceRecord.updateMany({
        where: { id: { in: ids } },
        data: { followUpDone: false },
      });
      reopened += result.count;
    }
  }

  return reopened;
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
  const follow = opts.follow ?? "pending";
  const where = buildFollowUpWhere(user, {
    ...opts,
    follow: opts.priority ? "all" : follow,
  });

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
  let priorityPending = 0;
  let priorityDone = 0;

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

    if (opts.priority) {
      if (todayPriority !== opts.priority) continue;
      if (row.followUpDone) priorityDone += 1;
      else priorityPending += 1;
      if (follow === "pending" && row.followUpDone) continue;
      if (follow === "done" && !row.followUpDone) continue;
    }

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
      alertKind: xlvEffectiveAlertKind({
        sleepDays: row.sleepDays,
        cumulativeTxns: row.cumulativeTxns,
        qualificationStatus: row.qualificationStatus,
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
  const displayCounts = opts.priority
    ? {
        pending: priorityPending,
        done: priorityDone,
        all: priorityPending + priorityDone,
      }
    : counts;

  return {
    follow,
    priority: opts.priority ?? null,
    counts: displayCounts,
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
  const updated = await db.xlvDeviceRecord.update({
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
            followUpReviewNote: null,
            followUpReviewAt: null,
            followUpReviewById: null,
            followUpReviewByName: null,
          }
        : {
            followUpConnectStatus: null,
            followUpFlags: [],
            followUpPhotoUrls: [],
            followUpReviewNote: null,
            followUpReviewAt: null,
            followUpReviewById: null,
            followUpReviewByName: null,
          }),
    },
    select: {
      deviceSn: true,
      merchantName: true,
      activationMerchantName: true,
      operatorName: true,
      managerName: true,
      followUpDone: true,
      followUpNote: true,
      followUpAt: true,
      followUpById: true,
      followUpConnectStatus: true,
      followUpFlags: true,
      followUpPhotoUrls: true,
    },
  });

  if (updated.followUpDone && updated.followUpAt) {
    const {
      notifyFollowUpDoneRecipients,
      resolveXlvDeviceManagerRecipient,
    } = await import("@/services/xlv/notifications");
    const managerId = await resolveXlvDeviceManagerRecipient(updated);
    const actor = await db.xlvMemberAccount.findUnique({
      where: { id: input.followUpById },
      select: { name: true },
    });
    const followUpByName = actor?.name ?? updated.operatorName;
    await notifyFollowUpDoneRecipients({
      managerXlvMemberAccountId: managerId,
      followUpById: input.followUpById,
      payload: {
        deviceSn: updated.deviceSn,
        merchantName: updated.merchantName,
        activationMerchantName: updated.activationMerchantName,
        operatorName: updated.operatorName,
        connectStatus: updated.followUpConnectStatus,
        flags: updated.followUpFlags,
        photoUrls: updated.followUpPhotoUrls,
        followUpByName,
        followUpAt: updated.followUpAt,
      },
    });
  }

  return updated;
}
