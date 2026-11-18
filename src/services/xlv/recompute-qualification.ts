import { db } from "@/lib/db";
import {
  XLV_SLEEP_THRESHOLD_DAYS,
  type XlvQualificationStatus,
  xlvAssessmentStartDate,
} from "@/lib/xlv-rules";
import type { SessionUser } from "@/lib/permissions";
import {
  assertCanViewXlv,
  buildXlvAssignedDeviceWhere,
  buildXlvRoleWhere,
} from "@/services/xlv/xlv-scope";
import {
  loadXlvSnapshotMap,
  loadXlvSnapshotMapForQualification,
  xlvQualificationOf,
} from "@/services/xlv/assessment";
import {
  checkImportMemoryOrAbort,
  logImportMemoryRss,
  maybeGc,
  yieldImportTick,
} from "@/services/import/xlv-import-memory";

export const XLV_QUALIFICATION_RULE_VERSION = "2026-10-natural-month";

const DEVICE_QUAL_SELECT = {
  deviceSn: true,
  firstTxnDate: true,
  relocatedAt: true,
  cumulativeUsers: true,
  cumulativeTxns: true,
  sleepDays: true,
} as const;

/** 单台设备：读快照算考核并写回设备表 */
export async function syncXlvQualificationStatus(
  deviceSn: string,
  status: XlvQualificationStatus
) {
  await db.xlvDeviceRecord.update({
    where: { deviceSn },
    data: {
      qualificationStatus: status,
      qualificationAssessedAt: new Date(),
    },
  });
}

/** 列表/详情发现与库内状态不一致时写回 */
export async function syncXlvQualificationStatuses(
  updates: { deviceSn: string; status: XlvQualificationStatus }[]
) {
  const unique = new Map<string, XlvQualificationStatus>();
  for (const row of updates) {
    unique.set(row.deviceSn, row.status);
  }
  await Promise.all(
    [...unique.entries()].map(([deviceSn, status]) =>
      syncXlvQualificationStatus(deviceSn, status)
    )
  );
}

/** 单台设备：读快照算考核并写回设备表 */
export async function recomputeXlvQualificationForDevice(
  deviceSn: string
): Promise<XlvQualificationStatus> {
  const device = await db.xlvDeviceRecord.findUnique({
    where: { deviceSn },
    select: DEVICE_QUAL_SELECT,
  });
  if (!device) return "in_progress";

  const start = xlvAssessmentStartDate(device);
  const snapshotMap = await loadXlvSnapshotMap(
    [deviceSn],
    start ? { statDateFrom: start } : undefined
  );
  const snapshots = snapshotMap.get(deviceSn) ?? [];
  const status = xlvQualificationOf(device, snapshots);

  await db.xlvDeviceRecord.update({
    where: { deviceSn },
    data: {
      qualificationStatus: status,
      qualificationAssessedAt: new Date(),
    },
  });

  return status;
}

/** 导入后：仅重算本批涉及的设备（分批拉快照，按下界 firstTxnDate） */
export async function recomputeXlvQualificationForDevices(
  deviceSns: string[],
  opts?: {
    onProgress?: (done: number, total: number) => void | Promise<void>;
    /** 原始表导入尾声：分批拉快照 + RSS 护栏 */
    importPhase?: boolean;
  }
) {
  const unique = [...new Set(deviceSns.filter(Boolean))];
  const total = unique.length;
  const DEVICE_CHUNK = 80;
  const importPhase = opts?.importPhase === true;

  if (importPhase) {
    checkImportMemoryOrAbort();
    logImportMemoryRss("qual-start");
  }

  let batchIndex = 0;
  for (let i = 0; i < unique.length; i += DEVICE_CHUNK) {
    const slice = unique.slice(i, i + DEVICE_CHUNK);
    const devices = await db.xlvDeviceRecord.findMany({
      where: { deviceSn: { in: slice } },
      select: DEVICE_QUAL_SELECT,
    });
    if (devices.length === 0) {
      await opts?.onProgress?.(Math.min(i + slice.length, total), total);
      continue;
    }

    batchIndex += 1;
    if (importPhase) {
      checkImportMemoryOrAbort();
      logImportMemoryRss(`qual-chunk-${batchIndex}-before-fetch`);
    }

    const snapshotMap = importPhase
      ? await loadXlvSnapshotMapForQualification(devices)
      : await loadXlvSnapshotMap(
          devices.map((d) => d.deviceSn),
          (() => {
            const earliestStart = devices.reduce<Date | undefined>((min, d) => {
              const start = xlvAssessmentStartDate(d);
              if (!start) return min;
              if (!min || start < min) return min;
              return min;
            }, undefined);
            return earliestStart ? { statDateFrom: earliestStart } : undefined;
          })()
        );

    if (importPhase) {
      checkImportMemoryOrAbort();
      logImportMemoryRss(`qual-chunk-${batchIndex}-after-fetch`);
    }

    const byStatus = new Map<XlvQualificationStatus, string[]>();
    for (const device of devices) {
      const snapshots = snapshotMap.get(device.deviceSn) ?? [];
      const status = xlvQualificationOf(device, snapshots);
      const list = byStatus.get(status) ?? [];
      list.push(device.deviceSn);
      byStatus.set(status, list);
    }

    snapshotMap.clear();

    const assessedAt = new Date();
    await Promise.all(
      [...byStatus.entries()].map(([status, sns]) =>
        db.xlvDeviceRecord.updateMany({
          where: { deviceSn: { in: sns } },
          data: { qualificationStatus: status, qualificationAssessedAt: assessedAt },
        })
      )
    );

    if (importPhase) {
      checkImportMemoryOrAbort();
      logImportMemoryRss(`qual-chunk-${batchIndex}-done`);
      maybeGc();
      await yieldImportTick();
    }

    await opts?.onProgress?.(Math.min(i + slice.length, total), total);
  }

  if (importPhase) {
    checkImportMemoryOrAbort();
    logImportMemoryRss("qual-done");
  }
}

/** 部署/回填：全量重算（仅当尚未评估或规则升级时调用） */
export async function recomputeAllXlvQualifications(opts?: {
  onProgress?: (done: number, total: number) => void | Promise<void>;
}) {
  const rows = await db.xlvDeviceRecord.findMany({
    where: buildXlvAssignedDeviceWhere(),
    select: { deviceSn: true },
    orderBy: { deviceSn: "asc" },
  });
  await recomputeXlvQualificationForDevices(
    rows.map((r) => r.deviceSn),
    opts
  );
}

/** 看板顶部：达标/无效/活跃 — 直接 COUNT，不加载快照 */
export async function countXlvQualificationSummary(user: SessionUser) {
  assertCanViewXlv(user);
  const assigned = {
    AND: [buildXlvRoleWhere(user), buildXlvAssignedDeviceWhere()],
  };

  const [qualifiedCount, inProgressCount, invalidCount, active] =
    await Promise.all([
      db.xlvDeviceRecord.count({
        where: { AND: [assigned, { qualificationStatus: "qualified" }] },
      }),
      db.xlvDeviceRecord.count({
        where: {
          AND: [
            assigned,
            { qualificationStatus: "in_progress" },
            { sleepDays: { lt: XLV_SLEEP_THRESHOLD_DAYS } },
          ],
        },
      }),
      db.xlvDeviceRecord.count({
        where: { AND: [assigned, { qualificationStatus: "invalid" }] },
      }),
      db.xlvDeviceRecord.count({
        where: {
          AND: [
            assigned,
            { sleepDays: { lt: XLV_SLEEP_THRESHOLD_DAYS } },
            { qualificationStatus: { not: "qualified" } },
          ],
        },
      }),
    ]);

  return { qualifiedCount, inProgressCount, invalidCount, active };
}

/** 若仍有设备从未评估、按旧两月窗口判了无效，或规则版本变了，在部署引导中重算 */
export async function backfillXlvQualificationIfNeeded() {
  const config = await db.systemConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { xlvQualificationRuleVersion: true },
  });
  const ruleChanged =
    config.xlvQualificationRuleVersion !== XLV_QUALIFICATION_RULE_VERSION;

  const pendingWhere = {
    AND: [
      buildXlvAssignedDeviceWhere(),
      {
        OR: [
          { qualificationAssessedAt: null },
          { qualificationStatus: "invalid" as const },
          ...(ruleChanged
            ? [{ qualificationStatus: "qualified" as const }]
            : []),
        ],
      },
    ],
  };

  const pending = await db.xlvDeviceRecord.count({ where: pendingWhere });
  if (pending === 0) {
    if (ruleChanged) {
      await db.systemConfig.update({
        where: { id: "singleton" },
        data: { xlvQualificationRuleVersion: XLV_QUALIFICATION_RULE_VERSION },
      });
    }
    return { scanned: 0, updated: 0 };
  }

  const rows = await db.xlvDeviceRecord.findMany({
    where: pendingWhere,
    select: { deviceSn: true },
  });
  await recomputeXlvQualificationForDevices(rows.map((r) => r.deviceSn));
  if (ruleChanged) {
    await db.systemConfig.update({
      where: { id: "singleton" },
      data: { xlvQualificationRuleVersion: XLV_QUALIFICATION_RULE_VERSION },
    });
  }
  return { scanned: rows.length, updated: rows.length };
}
