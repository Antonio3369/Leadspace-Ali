import type {
  XlvAlertKind,
  XlvQualificationStatus,
} from "@/lib/xlv-rules";

export type XlvDeviceSortMode = "risk" | "active" | "qualification" | "browse";

type SortableXlvDevice = {
  deviceSn: string;
  sleepDays: number;
  cumulativeTxns: number;
  cumulativeUsers: number;
  lastTxnDate?: Date | string | null;
  firstTxnDate?: Date | string | null;
  qualificationStatus?: XlvQualificationStatus;
  qualificationDetail?: { usersGap: number; txnsGap: number };
  qualificationGap?: { usersGap: number; txnsGap: number };
};

function dateMs(value: Date | string | null | undefined) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function qualificationGap(device: SortableXlvDevice) {
  const gap = device.qualificationDetail ?? device.qualificationGap;
  return (gap?.usersGap ?? 0) + (gap?.txnsGap ?? 0);
}

/** 按当前筛选解析列表排序策略 */
export function resolveXlvDeviceSortMode(opts: {
  alert?: XlvAlertKind;
  qualificationStatus?: XlvQualificationStatus | null;
  search?: string | null;
}): XlvDeviceSortMode {
  if (opts.qualificationStatus) return "qualification";
  if (opts.alert === "active") return "active";
  if (
    opts.alert === "sleep" ||
    opts.alert === "single_silence" ||
    opts.alert === "dormant"
  ) {
    return "risk";
  }
  if (opts.search?.trim()) return "browse";
  return "browse";
}

export function sortXlvDevices<T extends SortableXlvDevice>(
  devices: T[],
  mode: XlvDeviceSortMode,
  qualificationStatus?: XlvQualificationStatus | null
): T[] {
  const sorted = [...devices];
  sorted.sort((a, b) => {
    switch (mode) {
      case "risk":
        return (
          b.sleepDays - a.sleepDays ||
          a.cumulativeTxns - b.cumulativeTxns ||
          a.deviceSn.localeCompare(b.deviceSn)
        );
      case "active":
        return (
          a.sleepDays - b.sleepDays ||
          b.cumulativeTxns - a.cumulativeTxns ||
          dateMs(b.lastTxnDate) - dateMs(a.lastTxnDate) ||
          a.deviceSn.localeCompare(b.deviceSn)
        );
      case "browse":
        return (
          dateMs(b.lastTxnDate) - dateMs(a.lastTxnDate) ||
          dateMs(b.firstTxnDate) - dateMs(a.firstTxnDate) ||
          a.deviceSn.localeCompare(b.deviceSn)
        );
      case "qualification": {
        const status = qualificationStatus ?? a.qualificationStatus;
        if (status === "qualified") {
          return (
            b.cumulativeTxns - a.cumulativeTxns ||
            b.cumulativeUsers - a.cumulativeUsers ||
            a.deviceSn.localeCompare(b.deviceSn)
          );
        }
        if (status === "invalid") {
          return (
            dateMs(a.firstTxnDate) - dateMs(b.firstTxnDate) ||
            a.deviceSn.localeCompare(b.deviceSn)
          );
        }
        return (
          qualificationGap(b) - qualificationGap(a) ||
          dateMs(a.firstTxnDate) - dateMs(b.firstTxnDate) ||
          a.deviceSn.localeCompare(b.deviceSn)
        );
      }
      default:
        return a.deviceSn.localeCompare(b.deviceSn);
    }
  });
  return sorted;
}
