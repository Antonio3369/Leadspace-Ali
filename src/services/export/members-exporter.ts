import * as XLSX from "xlsx";
import { ROLE_LABELS } from "@/lib/constants";
import type { MemberQuery } from "@/services/stats/analytics";
import { getMemberStats } from "@/services/stats/analytics";
import type { SessionUser } from "@/lib/permissions";

const EXPORT_COLUMNS = [
  { key: "name", header: "姓名" },
  { key: "role", header: "角色" },
  { key: "totalMerchants", header: "拓展数" },
  { key: "photoPassRate", header: "照片通过率" },
  { key: "salesActivationRate", header: "动销通过率" },
  { key: "riskComplianceRate", header: "风控达标率" },
  { key: "estimatedRiskRate", header: "预估达标率" },
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

export async function exportMembersExcel(user: SessionUser, params: MemberQuery) {
  const { members, listType, canExport } = await getMemberStats(user, params);

  if (!canExport) {
    throw new Error("当前账号不可导出人员明细");
  }

  const rows = members.map((m) => ({
    name: m.name,
    role: listType === "managers" ? "经理" : (ROLE_LABELS[m.role] ?? m.role),
    totalMerchants: m.metrics.totalMerchants,
    photoPassRate: `${m.metrics.photoPassRate.toFixed(1)}%`,
    salesActivationRate: `${m.metrics.salesActivationRate.toFixed(1)}%`,
    riskComplianceRate: `${m.metrics.riskComplianceRate.toFixed(1)}%`,
    estimatedRiskRate: `${m.metrics.estimatedRiskRate.toFixed(1)}%`,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: EXPORT_COLUMNS.map((c) => c.key),
  });
  XLSX.utils.sheet_add_aoa(sheet, [EXPORT_COLUMNS.map((c) => c.header)], { origin: "A1" });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "人员明细");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return {
    buffer,
    filename: `人员明细_${formatTimestamp()}.xlsx`,
    count: members.length,
  };
}
