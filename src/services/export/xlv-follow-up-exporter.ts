import * as XLSX from "xlsx";
import type { SessionUser } from "@/lib/permissions";
import { canExport } from "@/lib/permissions";
import { xlvDeviceUserStatusLabel } from "@/lib/xlv-device-display";
import {
  connectStatusLabel,
  summarizeFollowUpResult,
} from "@/lib/xlv-follow-up";
import { isXlvDeviceWokenUp, xlvWakeUpStatusLabel } from "@/lib/xlv-wake-up";
import { loadXlvSnapshotMap } from "@/services/xlv/assessment";
import {
  getXlvFollowUpDevices,
  type XlvFollowFilter,
  type XlvFollowUpPriority,
} from "@/services/xlv/follow-up";

const EXPORT_COLUMNS = [
  { key: "managerName", header: "经理" },
  { key: "operatorName", header: "队员" },
  { key: "merchantName", header: "商户" },
  { key: "deviceSn", header: "设备SN" },
  { key: "alertKind", header: "沉睡类型" },
  { key: "followUpStatus", header: "回访状态" },
  { key: "followUpResult", header: "跟进结果" },
  { key: "followUpNote", header: "备注" },
  { key: "followUpAt", header: "跟进时间" },
  { key: "wakeUpStatus", header: "唤醒状态" },
  { key: "sleepDays", header: "沉睡天数" },
  { key: "lastTxnDate", header: "末笔日期" },
] as const;

function formatTimestamp() {
  return new Date()
    .toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/[/:]/g, "")
    .replace(/\s/g, "_");
}

export async function exportXlvFollowUpExcel(
  user: SessionUser,
  opts: {
    follow?: XlvFollowFilter;
    priority?: XlvFollowUpPriority | null;
    managerName?: string | null;
    operatorName?: string | null;
    search?: string | null;
  }
) {
  if (!canExport(user.role, user.status)) {
    throw new Error("当前账号不可导出");
  }

  const data = await getXlvFollowUpDevices(user, {
    follow: opts.follow ?? "pending",
    priority: opts.priority ?? null,
    managerName: opts.managerName,
    operatorName: opts.operatorName,
    search: opts.search,
  });

  const snapshotMap = await loadXlvSnapshotMap(
    data.devices.map((d) => d.deviceSn)
  );

  const rows = data.devices.map((d) => {
    const snapshots = snapshotMap.get(d.deviceSn) ?? [];
    const latestSnapshot = snapshots[snapshots.length - 1];
    const woken = isXlvDeviceWokenUp(
      {
        followUpDone: d.followUpDone,
        followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
        sleepDays: d.sleepDays,
        lastTxnDate: d.lastTxnDate ? new Date(d.lastTxnDate) : null,
        statDate: latestSnapshot?.statDate ?? null,
      },
      snapshots
    );

    return {
      managerName: d.managerName,
      operatorName: d.operatorName,
      merchantName: d.merchantName || d.activationMerchantName || "未命名商户",
      deviceSn: d.deviceSn,
      alertKind: xlvDeviceUserStatusLabel({
        alertKind: d.alertKind,
        qualificationStatus: d.qualificationStatus,
        sleepDays: d.sleepDays,
      }),
      followUpStatus: d.followUpDone ? "已回访" : "待回访",
      followUpResult: d.followUpDone
        ? summarizeFollowUpResult({
            connectStatus: d.followUpConnectStatus,
            flags: d.followUpFlags,
          })
        : "",
      followUpNote: d.followUpNote ?? "",
      followUpAt: d.followUpAt ?? "",
      wakeUpStatus: xlvWakeUpStatusLabel(woken, d.followUpDone),
      sleepDays: d.sleepDays,
      lastTxnDate: d.lastTxnDate ?? "",
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: EXPORT_COLUMNS.map((c) => c.key),
  });
  XLSX.utils.sheet_add_aoa(sheet, [EXPORT_COLUMNS.map((c) => c.header)], {
    origin: "A1",
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "沉睡回访");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  const followLabel =
    opts.follow === "done"
      ? "已回访"
      : opts.follow === "all"
        ? "全部"
        : "待回访";

  return {
    buffer,
    filename: `小绿盒沉睡回访_${followLabel}_${formatTimestamp()}.xlsx`,
    count: rows.length,
  };
}
