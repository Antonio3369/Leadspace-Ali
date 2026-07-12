import type { CoreMetrics } from "@/services/stats/query";

export type TeamDetailSortKey =
  | "totalMerchants"
  | "photoPassRate"
  | "salesActivationRate"
  | "riskComplianceRate"
  | "estimatedRiskRate";

export const TEAM_DETAIL_SORT_OPTIONS: {
  value: TeamDetailSortKey;
  label: string;
}[] = [
  { value: "totalMerchants", label: "拓展数" },
  { value: "photoPassRate", label: "照片通过率" },
  { value: "salesActivationRate", label: "动销通过率" },
  { value: "riskComplianceRate", label: "风控达标率" },
  { value: "estimatedRiskRate", label: "预估达标率" },
];

export const DEFAULT_TEAM_DETAIL_SORT: TeamDetailSortKey = "totalMerchants";

export interface TeamDetailMetrics {
  totalMerchants: number;
  photoPassRate: number;
  salesActivationRate: number;
  riskComplianceRate: number;
  estimatedRiskRate: number;
}

export interface TeamDetailRow {
  id: string;
  name: string;
  memberCount?: number;
  metrics: TeamDetailMetrics;
}

export interface RankedTeamDetailRow extends TeamDetailRow {
  rank: number;
}

export function toTeamDetailMetrics(metrics: CoreMetrics): TeamDetailMetrics {
  return {
    totalMerchants: metrics.totalMerchants,
    photoPassRate: metrics.photoPassRate,
    salesActivationRate: metrics.salesActivationRate,
    riskComplianceRate: metrics.riskComplianceRate,
    estimatedRiskRate: metrics.estimatedRiskRate,
  };
}

export function rankTeamDetailRows(
  rows: TeamDetailRow[],
  sortBy: TeamDetailSortKey
): RankedTeamDetailRow[] {
  const sorted = [...rows].sort((a, b) => {
    const primary = b.metrics[sortBy] - a.metrics[sortBy];
    if (primary !== 0) return primary;
    const secondary = b.metrics.totalMerchants - a.metrics.totalMerchants;
    if (secondary !== 0) return secondary;
    return a.name.localeCompare(b.name, "zh");
  });

  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function parseTeamDetailSort(value: string | null | undefined): TeamDetailSortKey {
  if (
    value === "photoPassRate" ||
    value === "salesActivationRate" ||
    value === "riskComplianceRate" ||
    value === "estimatedRiskRate" ||
    value === "totalMerchants"
  ) {
    return value;
  }
  return DEFAULT_TEAM_DETAIL_SORT;
}
