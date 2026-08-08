import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  assessXlvQualification,
  getXlvQualificationDetail,
  type XlvQualificationDetail,
  type XlvQualificationStatus,
} from "@/lib/xlv-rules";
import {
  dedupeXlvSnapshotsByStatDate,
  enrichXlvSnapshotDailyMetrics,
} from "@/services/xlv/snapshot-daily";

export type { XlvQualificationDetail, XlvQualificationStatus };

export type XlvDeviceQualificationInput = {
  deviceSn: string;
  firstTxnDate: Date | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
};

export async function loadXlvSnapshotMap(
  deviceSns: string[],
  opts?: { statDateGte?: Date | null }
) {
  if (deviceSns.length === 0) {
    return new Map<
      string,
      {
        statDate: Date;
        cumulativeUsers: number;
        cumulativeTxns: number;
        sleepDays: number;
        lastTxnDate: Date | null;
      }[]
    >();
  }

  type SnapshotRow = {
    deviceSn: string;
    statDate: Date;
    cumulativeUsers: number;
    cumulativeTxns: number;
    dailyUsers: number;
    dailyTxns: number;
    sleepDays: number;
    lastTxnDate: Date | null;
  };

  const statDateGte = opts?.statDateGte ?? null;
  const rows: SnapshotRow[] = [];
  const chunkSize = 250;

  for (let i = 0; i < deviceSns.length; i += chunkSize) {
    const chunk = deviceSns.slice(i, i + chunkSize);
    const chunkRows = await db.$queryRaw<SnapshotRow[]>(Prisma.sql`
      SELECT
        s."deviceSn" AS "deviceSn",
        s."statDate" AS "statDate",
        s."cumulativeUsers" AS "cumulativeUsers",
        s."cumulativeTxns" AS "cumulativeTxns",
        s."dailyUsers" AS "dailyUsers",
        s."dailyTxns" AS "dailyTxns",
        s."sleepDays" AS "sleepDays",
        s."lastTxnDate" AS "lastTxnDate"
      FROM "XlvDeviceSnapshot" s
      INNER JOIN "XlvDeviceRecord" d ON s."deviceSn" = d."deviceSn"
      WHERE s."deviceSn" IN (${Prisma.join(chunk)})
      AND (
        (
          d."firstTxnDate" IS NOT NULL
          AND s."statDate" >= date_trunc('month', d."firstTxnDate")
          AND s."statDate" < date_trunc('month', d."firstTxnDate") + interval '4 months'
        )
        ${
          statDateGte
            ? Prisma.sql`OR s."statDate" >= ${statDateGte}`
            : Prisma.empty
        }
      )
      ORDER BY s."deviceSn" ASC, s."statDate" ASC
    `);
    rows.push(...chunkRows);
  }

  const map = new Map<
    string,
    {
      deviceSn: string;
      statDate: Date;
      cumulativeUsers: number;
      cumulativeTxns: number;
      dailyUsers: number;
      dailyTxns: number;
      sleepDays: number;
      lastTxnDate: Date | null;
    }[]
  >();
  for (const row of rows) {
    const list = map.get(row.deviceSn) ?? [];
    list.push(row);
    map.set(row.deviceSn, list);
  }
  for (const [deviceSn, list] of map) {
    map.set(
      deviceSn,
      enrichXlvSnapshotDailyMetrics(dedupeXlvSnapshotsByStatDate(list))
    );
  }
  return map;
}

export function buildXlvQualificationDetail(
  device: Omit<XlvDeviceQualificationInput, "deviceSn">,
  snapshots: { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
): XlvQualificationDetail {
  return getXlvQualificationDetail(device, snapshots, undefined, true);
}

export function xlvQualificationOf(
  device: Omit<XlvDeviceQualificationInput, "deviceSn">,
  snapshots: { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
): XlvQualificationStatus {
  return assessXlvQualification(device, snapshots, undefined, true);
}

export function attachXlvQualifications<T extends XlvDeviceQualificationInput>(
  devices: T[],
  snapshotMap: Map<
    string,
    { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
  >
) {
  return attachXlvQualificationDetails(devices, snapshotMap);
}

export function attachXlvQualificationDetails<T extends XlvDeviceQualificationInput>(
  devices: T[],
  snapshotMap: Map<
    string,
    { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
  >
) {
  return devices.map((device) => {
    const snapshots = snapshotMap.get(device.deviceSn) ?? [];
    return {
      ...device,
      qualificationStatus: xlvQualificationOf(device, snapshots),
      qualificationDetail: buildXlvQualificationDetail(device, snapshots),
    };
  });
}
