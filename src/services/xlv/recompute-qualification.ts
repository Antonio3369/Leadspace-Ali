import { db } from "@/lib/db";
import {
  XLV_SLEEP_THRESHOLD_DAYS,
  type XlvQualificationStatus,
} from "@/lib/xlv-rules";
import type { SessionUser } from "@/lib/permissions";
import {
  assertCanViewXlv,
  buildXlvAssignedDeviceWhere,
  buildXlvRoleWhere,
} from "@/services/xlv/xlv-scope";
import { loadXlvSnapshotMap, xlvQualificationOf } from "@/services/xlv/assessment";

export const XLV_QUALIFICATION_RULE_VERSION = "2026-08-install-boundary";

const DEVICE_QUAL_SELECT = {
  deviceSn: true,
  firstTxnDate: true,
  cumulativeUsers: true,
  cumulativeTxns: true,
  sleepDays: true,
} as const;

/** 单台设备：读快照算考核并写回设备表 */
export async function recomputeXlvQualificationForDevice(
  deviceSn: string
): Promise<XlvQualificationStatus> {
  const device = await db.xlvDeviceRecord.findUnique({
    where: { deviceSn },
    select: DEVICE_QUAL_SELECT,
  });
  if (!device) return "in_progress";

  const snapshotMap = await loadXlvSnapshotMap([deviceSn]);
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

/** 导入后：仅重算本批涉及的设备（分批，降低峰值内存） */
export async function recomputeXlvQualificationForDevices(
  deviceSns: string[],
  opts?: { onProgress?: (done: number, total: number) => void | Promise<void> }
) {
  const unique = [...new Set(deviceSns.filter(Boolean))];
  const total = unique.length;
  const CHUNK = 25;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    for (const sn of slice) {
      await recomputeXlvQualificationForDevice(sn);
    }
    await opts?.onProgress?.(Math.min(i + slice.length, total), total);
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
        where: { AND: [assigned, { qualificationStatus: "in_progress" }] },
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

/** 若仍有设备从未评估，在部署引导中回填 */
export async function backfillXlvQualificationIfNeeded() {
  const pending = await db.xlvDeviceRecord.count({
    where: {
      AND: [
        buildXlvAssignedDeviceWhere(),
        { qualificationAssessedAt: null },
      ],
    },
  });
  if (pending === 0) return { scanned: 0, updated: pending };

  const rows = await db.xlvDeviceRecord.findMany({
    where: {
      AND: [
        buildXlvAssignedDeviceWhere(),
        { qualificationAssessedAt: null },
      ],
    },
    select: { deviceSn: true },
  });
  await recomputeXlvQualificationForDevices(rows.map((r) => r.deviceSn));
  return { scanned: rows.length, updated: rows.length };
}
