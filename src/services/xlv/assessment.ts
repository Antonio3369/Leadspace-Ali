import { db } from "@/lib/db";
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

export type XlvSnapshotRow = {
  deviceSn: string;
  statDate: Date;
  cumulativeUsers: number;
  cumulativeTxns: number;
  dailyUsers: number;
  dailyTxns: number;
  sleepDays: number;
  lastTxnDate: Date | null;
};

export async function loadXlvSnapshotMap(deviceSns: string[]) {
  if (deviceSns.length === 0) {
    return new Map<string, XlvSnapshotRow[]>();
  }

  return loadXlvSnapshotMapSerial(deviceSns);
}

/** 进程内串行加载快照，避免 Tab 切换时多请求并发把容器打 OOM */
let snapshotLoadGate: Promise<unknown> = Promise.resolve();

const SNAPSHOT_DEVICE_BATCH = 80;

async function loadXlvSnapshotMapSerial(deviceSns: string[]) {
  const run = async () => {
    const map = new Map<string, XlvSnapshotRow[]>();

    for (let i = 0; i < deviceSns.length; i += SNAPSHOT_DEVICE_BATCH) {
      const chunk = deviceSns.slice(i, i + SNAPSHOT_DEVICE_BATCH);
      const rows = await db.xlvDeviceSnapshot.findMany({
        where: { deviceSn: { in: chunk } },
        select: {
          deviceSn: true,
          statDate: true,
          cumulativeUsers: true,
          cumulativeTxns: true,
          dailyUsers: true,
          dailyTxns: true,
          sleepDays: true,
          lastTxnDate: true,
        },
        orderBy: [{ deviceSn: "asc" }, { statDate: "asc" }],
      });

      for (const row of rows) {
        const list = map.get(row.deviceSn) ?? [];
        list.push(row);
        map.set(row.deviceSn, list);
      }
    }

    for (const [deviceSn, list] of map) {
      map.set(
        deviceSn,
        enrichXlvSnapshotDailyMetrics(dedupeXlvSnapshotsByStatDate(list))
      );
    }
    return map;
  };

  const result = snapshotLoadGate.then(() => run());
  snapshotLoadGate = result.then(
    () => undefined,
    () => undefined
  );
  return result;
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

export function attachXlvQualificationDetails<
  T extends XlvDeviceQualificationInput & {
    qualificationStatus?: XlvQualificationStatus;
  },
>(
  devices: T[],
  snapshotMap: Map<
    string,
    { statDate: Date; cumulativeUsers: number; cumulativeTxns: number }[]
  >
) {
  return devices.map((device) => {
    const snapshots = snapshotMap.get(device.deviceSn) ?? [];
    const qualificationDetail = buildXlvQualificationDetail(device, snapshots);
    return {
      ...device,
      qualificationStatus: qualificationDetail.status,
      qualificationDetail,
    };
  });
}
