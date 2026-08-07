import { db } from "@/lib/db";
import {
  assessXlvQualification,
  getXlvQualificationDetail,
  type XlvQualificationDetail,
  type XlvQualificationStatus,
} from "@/lib/xlv-rules";
import { dedupeXlvSnapshotsByStatDate } from "@/services/xlv/snapshot-daily";

export type { XlvQualificationDetail, XlvQualificationStatus };

export type XlvDeviceQualificationInput = {
  deviceSn: string;
  firstTxnDate: Date | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
};

export async function loadXlvSnapshotMap(deviceSns: string[]) {
  if (deviceSns.length === 0) {
    return new Map<
      string,
      { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
    >();
  }

  const rows = await db.xlvDeviceSnapshot.findMany({
    where: { deviceSn: { in: deviceSns } },
    select: {
      deviceSn: true,
      statDate: true,
      cumulativeUsers: true,
      cumulativeTxns: true,
    },
    orderBy: { statDate: "asc" },
  });

  const map = new Map<
    string,
    { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
  >();
  for (const row of rows) {
    const list = map.get(row.deviceSn) ?? [];
    list.push(row);
    map.set(row.deviceSn, list);
  }
  for (const [deviceSn, list] of map) {
    map.set(deviceSn, dedupeXlvSnapshotsByStatDate(list));
  }
  return map;
}

export function buildXlvQualificationDetail(
  device: Omit<XlvDeviceQualificationInput, "deviceSn">,
  snapshots: { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
): XlvQualificationDetail {
  return getXlvQualificationDetail(device, snapshots);
}

export function xlvQualificationOf(
  device: Omit<XlvDeviceQualificationInput, "deviceSn">,
  snapshots: { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
): XlvQualificationStatus {
  return assessXlvQualification(device, snapshots);
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
