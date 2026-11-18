import { xlvAssessmentStartDate } from "@/lib/xlv-rules";
export type XlvDeviceQualificationInput = {
  deviceSn: string;
  firstTxnDate: Date | null;
  relocatedAt?: Date | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
};

export const QUALIFICATION_IMPORT_DEVICE_BATCH = 32;

export type QualificationSnapshotBatch = {
  deviceSns: string[];
  /** 本批最早考核起点；无起点设备单独成批且不传下界 */
  statDateFrom?: Date;
};

/** 导入后考核：按各设备考核起点排序分批，避免 min(全 chunk) 拖入过长历史 */
export function planQualificationSnapshotBatches(
  devices: Array<XlvDeviceQualificationInput>,
  batchSize = QUALIFICATION_IMPORT_DEVICE_BATCH
): QualificationSnapshotBatch[] {
  const withStart: { deviceSn: string; start: Date }[] = [];
  const withoutStart: string[] = [];

  for (const d of devices) {
    const start = xlvAssessmentStartDate(d);
    if (start) withStart.push({ deviceSn: d.deviceSn, start });
    else withoutStart.push(d.deviceSn);
  }

  withStart.sort((a, b) => a.start.getTime() - b.start.getTime());

  const batches: QualificationSnapshotBatch[] = [];
  for (let i = 0; i < withStart.length; i += batchSize) {
    const chunk = withStart.slice(i, i + batchSize);
    batches.push({
      deviceSns: chunk.map((c) => c.deviceSn),
      statDateFrom: chunk[0]!.start,
    });
  }
  for (let i = 0; i < withoutStart.length; i += batchSize) {
    batches.push({
      deviceSns: withoutStart.slice(i, i + batchSize),
    });
  }
  return batches;
}