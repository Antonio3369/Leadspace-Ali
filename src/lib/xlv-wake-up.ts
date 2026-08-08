import { XLV_SLEEP_THRESHOLD_DAYS } from "@/lib/xlv-rules";
import { xlvStatDateKey } from "@/lib/xlv-stat-date";

export type XlvWakeUpSnapshot = {
  statDate: Date;
  sleepDays: number;
  lastTxnDate: Date | null;
};

function isWokenSnapshot(snap: XlvWakeUpSnapshot, followUpAt: Date): boolean {
  if (snap.statDate.getTime() <= followUpAt.getTime()) return false;
  if (snap.sleepDays < XLV_SLEEP_THRESHOLD_DAYS) return true;
  if (snap.lastTxnDate && snap.lastTxnDate.getTime() > followUpAt.getTime()) {
    return true;
  }
  return false;
}

/** 导入后自动判定：跟进后首次满足「不再沉睡」或末笔晚于跟进时间 */
export function detectXlvWakeUpDate(
  device: {
    sleepDays: number;
    lastTxnDate: Date | null;
    statDate: Date | null;
  },
  followUpAt: Date,
  snapshots: XlvWakeUpSnapshot[]
): string | null {
  const sorted = [...snapshots].sort(
    (a, b) => a.statDate.getTime() - b.statDate.getTime()
  );
  for (const snap of sorted) {
    if (isWokenSnapshot(snap, followUpAt)) {
      return xlvStatDateKey(snap.statDate);
    }
  }

  if (device.sleepDays < XLV_SLEEP_THRESHOLD_DAYS) {
    const ref = device.statDate ?? followUpAt;
    return xlvStatDateKey(ref);
  }
  if (device.lastTxnDate && device.lastTxnDate.getTime() > followUpAt.getTime()) {
    return xlvStatDateKey(device.lastTxnDate);
  }
  return null;
}

export function isXlvDeviceWokenUp(
  device: {
    followUpDone: boolean;
    followUpAt: Date | null;
    sleepDays: number;
    lastTxnDate: Date | null;
    statDate: Date | null;
  },
  snapshots: XlvWakeUpSnapshot[]
): boolean {
  if (!device.followUpDone || !device.followUpAt) return false;
  return detectXlvWakeUpDate(device, device.followUpAt, snapshots) !== null;
}

export function xlvWakeUpStatusLabel(woken: boolean, followUpDone: boolean): string {
  if (!followUpDone) return "未回访";
  return woken ? "已唤醒" : "仍沉睡";
}
