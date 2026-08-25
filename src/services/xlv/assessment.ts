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
  relocatedAt?: Date | null;
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

export type LoadXlvSnapshotMapOpts = {
  /** 只拉该日（含）之后的快照；不传则与原来一样拉全历史 */
  statDateFrom?: Date;
};

export async function loadXlvSnapshotMap(
  deviceSns: string[],
  opts?: LoadXlvSnapshotMapOpts
) {
  if (deviceSns.length === 0) {
    return new Map<string, XlvSnapshotRow[]>();
  }

  return loadXlvSnapshotMapSerial(deviceSns, opts);
}

/**
 * 唤醒判定只需 followUpAt 之后的快照。按跟进时间排序分批，
 * 每批用该批最早跟进日做下界，避免把跟进前的历史一并拉进堆。
 */
export async function loadXlvSnapshotMapAfterFollowUp(
  devices: { deviceSn: string; followUpAt: Date | null | undefined }[]
) {
  const items = devices
    .filter(
      (d): d is { deviceSn: string; followUpAt: Date } => d.followUpAt != null
    )
    .sort((a, b) => a.followUpAt.getTime() - b.followUpAt.getTime());

  if (items.length === 0) {
    return new Map<string, XlvSnapshotRow[]>();
  }

  const run = async () => {
    const map = new Map<string, XlvSnapshotRow[]>();
    for (let i = 0; i < items.length; i += SNAPSHOT_DEVICE_BATCH) {
      const chunk = items.slice(i, i + SNAPSHOT_DEVICE_BATCH);
      const part = await fetchSnapshotChunk(
        chunk.map((d) => d.deviceSn),
        chunk[0]!.followUpAt
      );
      for (const [deviceSn, list] of part) {
        map.set(deviceSn, list);
      }
    }
    return map;
  };

  return enqueueSnapshotLoad(run);
}

/** 进程内串行加载快照，避免 Tab 切换时多请求并发把容器打 OOM */
let snapshotLoadGate: Promise<unknown> = Promise.resolve();

const SNAPSHOT_DEVICE_BATCH = 80;

const SNAPSHOT_SELECT = {
  deviceSn: true,
  statDate: true,
  cumulativeUsers: true,
  cumulativeTxns: true,
  dailyUsers: true,
  dailyTxns: true,
  sleepDays: true,
  lastTxnDate: true,
} as const;

function enqueueSnapshotLoad<T>(run: () => Promise<T>): Promise<T> {
  const result = snapshotLoadGate.then(() => run());
  snapshotLoadGate = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function fetchSnapshotChunk(
  chunk: string[],
  statDateFrom?: Date
): Promise<Map<string, XlvSnapshotRow[]>> {
  const map = new Map<string, XlvSnapshotRow[]>();
  const rows = await db.xlvDeviceSnapshot.findMany({
    where: {
      deviceSn: { in: chunk },
      ...(statDateFrom ? { statDate: { gte: statDateFrom } } : {}),
    },
    select: SNAPSHOT_SELECT,
    orderBy: [{ deviceSn: "asc" }, { statDate: "asc" }],
  });

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

async function loadXlvSnapshotMapSerial(
  deviceSns: string[],
  opts?: LoadXlvSnapshotMapOpts
) {
  const run = async () => {
    const map = new Map<string, XlvSnapshotRow[]>();

    for (let i = 0; i < deviceSns.length; i += SNAPSHOT_DEVICE_BATCH) {
      const chunk = deviceSns.slice(i, i + SNAPSHOT_DEVICE_BATCH);
      const part = await fetchSnapshotChunk(chunk, opts?.statDateFrom);
      for (const [deviceSn, list] of part) {
        map.set(deviceSn, list);
      }
    }

    return map;
  };

  return enqueueSnapshotLoad(run);
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
