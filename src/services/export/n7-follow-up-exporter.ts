import * as XLSX from "xlsx";
import type { SessionUser } from "@/lib/permissions";
import { canExport } from "@/lib/permissions";
import type { N7Priority } from "@/lib/n7-rules";
import { n7PriorityLabel } from "@/lib/n7-rules";
import { getN7FollowUpDevices } from "@/services/n7/analytics";

const EXPORT_COLUMNS = [
  { key: "priority", header: "优先级" },
  { key: "remainingDays", header: "剩余天数" },
  { key: "managerName", header: "经理" },
  { key: "operatorName", header: "队员" },
  { key: "storeName", header: "门店" },
  { key: "deviceSn", header: "设备SN" },
  { key: "followUp", header: "处理状态" },
  { key: "followUpNote", header: "处理备注" },
  { key: "merchantPhone", header: "商户手机" },
  { key: "effectiveDays", header: "已用天数" },
  { key: "effectiveUsers", header: "已有用户" },
  { key: "gapReason", header: "缺口" },
  { key: "behaviors", header: "行为" },
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

function staffKeyOf(d: {
  salesUserId: string | null;
  operatorName: string;
}) {
  return d.salesUserId ?? `name:${d.operatorName}`;
}

function formatRemaining(d: {
  remainingEnded: boolean;
  remainingDays: number | null;
}) {
  if (d.remainingEnded) return "已结束";
  if (d.remainingDays == null) return "";
  return String(d.remainingDays);
}

function formatGap(d: {
  isQualified: boolean;
  daysGap: number;
  usersGap: number;
}) {
  if (d.isQualified) return "已达标";
  return `差${d.daysGap}天·差${d.usersGap}人`;
}

function formatBehaviors(d: {
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
}) {
  const tags: string[] = [];
  if (d.notLit) tags.push("未点亮");
  if (d.notSubscribed) tags.push("未订阅");
  if (d.notCheckedIn) tags.push("未打卡");
  return tags.join("、");
}

export async function exportN7FollowUpExcel(
  user: SessionUser,
  opts: {
    dateFrom?: string | null;
    dateTo?: string | null;
    yearMonth?: string | null;
    priority?: N7Priority | "all" | null;
    managerKey?: string | null;
    staffKey?: string | null;
    behavior?: "notSubscribed" | "notCheckedIn" | "notLit" | null;
  }
) {
  if (!canExport(user.role, user.status)) {
    throw new Error("当前账号不可导出");
  }

  const data = await getN7FollowUpDevices({
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    yearMonth: opts.yearMonth,
    priority: opts.priority ?? "all",
    managerKey: opts.managerKey,
  });

  let list = data.devices;
  if (opts.behavior === "notSubscribed") {
    list = list.filter((d) => d.notSubscribed);
  } else if (opts.behavior === "notCheckedIn") {
    list = list.filter((d) => d.notCheckedIn);
  } else if (opts.behavior === "notLit") {
    list = list.filter((d) => d.notLit);
  }
  if (opts.staffKey) {
    list = list.filter((d) => staffKeyOf(d) === opts.staffKey);
  }

  const rows = list.map((d) => ({
    priority: d.priority ? n7PriorityLabel(d.priority) : "",
    remainingDays: formatRemaining(d),
    managerName: d.managerName,
    operatorName: d.operatorName,
    storeName: d.storeName || "未命名门店",
    deviceSn: d.deviceSn,
    followUp: d.followUpDone ? "已处理" : "未处理",
    followUpNote: d.followUpNote ?? "",
    merchantPhone: d.merchantPhone ?? "",
    effectiveDays: d.effectiveDays,
    effectiveUsers: d.effectiveUsers,
    gapReason: formatGap(d),
    behaviors: formatBehaviors(d),
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: EXPORT_COLUMNS.map((c) => c.key),
  });
  XLSX.utils.sheet_add_aoa(sheet, [EXPORT_COLUMNS.map((c) => c.header)], {
    origin: "A1",
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "待跟进");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  const rangeLabel =
    data.dateFrom && data.dateTo
      ? `${data.dateFrom}_${data.dateTo}`
      : "全部";

  return {
    buffer,
    filename: `N7待跟进_${rangeLabel}_${formatTimestamp()}.xlsx`,
    count: list.length,
  };
}
