import * as XLSX from "xlsx";
import { PHOTO_LABELS, RISK_LABELS, SALES_LABELS } from "@/lib/ledger-labels";
import type { LedgerQuery } from "@/services/stats/analytics";
import { getLedgerRecordsForExport } from "@/services/stats/analytics";
import type { SessionUser } from "@/lib/permissions";

const EXPORT_COLUMNS = [
  { key: "jobNumber", header: "作业编号" },
  { key: "merchantName", header: "商家名称" },
  { key: "salesUserName", header: "业务员" },
  { key: "teamName", header: "团队" },
  { key: "opportunityName", header: "商机" },
  { key: "photoStatus", header: "照片审核" },
  { key: "riskStatus", header: "风控状态" },
  { key: "salesActivationStatus", header: "动销进度" },
  { key: "riskFailReason", header: "不通过原因" },
  { key: "expandDate", header: "拓展日期" },
] as const;

function formatExpandDate(value: Date) {
  return value.toLocaleDateString("zh-CN");
}

export async function exportLedgerExcel(
  user: SessionUser,
  params: Omit<LedgerQuery, "page" | "pageSize">
) {
  const records = await getLedgerRecordsForExport(user, params);

  const rows = records.map((r) => ({
    jobNumber: r.jobNumber,
    merchantName: r.merchantName,
    salesUserName: r.salesUserName,
    teamName: r.team?.name ?? "",
    opportunityName: r.opportunity?.name ?? r.opportunityName ?? "",
    photoStatus: PHOTO_LABELS[r.photoStatus] ?? r.photoStatus,
    riskStatus: RISK_LABELS[r.riskStatus] ?? r.riskStatus,
    salesActivationStatus: SALES_LABELS[r.salesActivationStatus] ?? r.salesActivationStatus,
    riskFailReason: r.riskFailReason ?? "",
    expandDate: formatExpandDate(r.expandDate),
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: EXPORT_COLUMNS.map((c) => c.key),
  });
  XLSX.utils.sheet_add_aoa(sheet, [EXPORT_COLUMNS.map((c) => c.header)], { origin: "A1" });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "风控台账");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const timestamp = new Date()
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

  return {
    buffer,
    filename: `风控台账_${timestamp}.xlsx`,
    count: records.length,
  };
}
