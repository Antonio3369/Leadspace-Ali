import * as XLSX from "xlsx";
import type { MemberQuery } from "@/services/stats/analytics";
import { getTeamDetails } from "@/services/stats/analytics";
import type { SessionUser } from "@/lib/permissions";
import {
  parseTeamDetailSort,
  rankTeamDetailRows,
  type TeamDetailSortKey,
} from "@/lib/team-details";

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

const STAFF_EXPORT_COLUMNS = [
  { key: "rank", header: "排名" },
  { key: "name", header: "姓名" },
  { key: "totalMerchants", header: "拓展数" },
  { key: "photoPassRate", header: "照片通过率" },
  { key: "salesActivationRate", header: "动销通过率" },
  { key: "riskComplianceRate", header: "风控达标率" },
  { key: "estimatedRiskRate", header: "预估达标率" },
] as const;

const MANAGER_EXPORT_COLUMNS = [
  { key: "rank", header: "排名" },
  { key: "name", header: "区域经理" },
  { key: "memberCount", header: "团队人数" },
  ...STAFF_EXPORT_COLUMNS.slice(2),
] as const;

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

export async function exportTeamDetailsExcel(
  user: SessionUser,
  params: MemberQuery & { sortBy?: TeamDetailSortKey }
) {
  const result = await getTeamDetails(user, params);

  if (!result.canExport) {
    throw new Error("当前账号不可导出团队明细");
  }

  const sortBy = parseTeamDetailSort(params.sortBy);
  const rows = rankTeamDetailRows(result.rows, sortBy);

  const exportRows = rows.map((row) => ({
    rank: row.rank,
    name: row.name,
    memberCount: row.memberCount ?? 0,
    totalMerchants: row.metrics.totalMerchants,
    photoPassRate: formatRate(row.metrics.photoPassRate),
    salesActivationRate: formatRate(row.metrics.salesActivationRate),
    riskComplianceRate: formatRate(row.metrics.riskComplianceRate),
    estimatedRiskRate: formatRate(row.metrics.estimatedRiskRate),
  }));

  const columns =
    result.listType === "managers" ? MANAGER_EXPORT_COLUMNS : STAFF_EXPORT_COLUMNS;

  const sheet = XLSX.utils.json_to_sheet(exportRows, {
    header: columns.map((column) => column.key),
  });
  XLSX.utils.sheet_add_aoa(sheet, [columns.map((column) => column.header)], { origin: "A1" });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "团队明细");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return {
    buffer,
    filename: `团队明细_${formatTimestamp()}.xlsx`,
    count: rows.length,
  };
}
