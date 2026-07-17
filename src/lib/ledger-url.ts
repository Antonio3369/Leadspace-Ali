import type { LedgerDatePreset } from "@/lib/ledger-date";
import { appendMultiSearchParam, parseMultiSearchParam } from "@/lib/query-params";

const LEDGER_DATE_PRESETS = new Set<LedgerDatePreset>([
  "month",
  "lastMonth",
  "30d",
  "90d",
  "all",
  "custom",
]);

export interface LedgerUrlFilters {
  dateFrom: string;
  dateTo: string;
  datePreset: LedgerDatePreset;
  search: string;
  managerId: string;
  salesUserId: string;
  opportunityId: string;
  /** 支持逗号分隔多选，如 IN_PROGRESS,NOT_ACTIVATED */
  riskStatus: string;
  photoStatus: string;
  salesStatus: string;
  page: number;
}

export type LedgerDrilldownContext = {
  dateFrom?: string;
  dateTo?: string;
  datePreset?: LedgerDatePreset;
  managerId?: string;
  salesUserId?: string;
  opportunityId?: string;
};

/** 首页/看板指标与饼图 → 台账钻取 */
export type MetricDrilldownKey =
  | "riskReviewActivated" // P0：审核中已动销
  | "salesPending" // P1：待动销达标 / 碰笔扫码交易未达标
  | "riskPendingNotActivated" // P2：审核中未动销
  | "riskPending"
  | "riskPassed"
  | "riskFailed"
  | "photoRejected"
  | "photoPending";

export const METRIC_LEDGER_DRILLDOWNS: Record<
  MetricDrilldownKey,
  Pick<LedgerUrlFilters, "riskStatus" | "photoStatus" | "salesStatus">
> = {
  /** P0：审核中已动销（可转化） */
  riskReviewActivated: {
    riskStatus: "PENDING",
    photoStatus: "",
    salesStatus: "ACTIVATED",
  },
  /** P1：照片已通过、笔数未达标（碰笔/扫码/交易未达标主因） */
  salesPending: {
    riskStatus: "",
    photoStatus: "APPROVED",
    salesStatus: "IN_PROGRESS",
  },
  /** P2：风控审核中且尚未动销 */
  riskPendingNotActivated: {
    riskStatus: "PENDING",
    photoStatus: "",
    salesStatus: "IN_PROGRESS,NOT_ACTIVATED",
  },
  riskPending: {
    riskStatus: "PENDING",
    photoStatus: "",
    salesStatus: "",
  },
  riskPassed: {
    riskStatus: "PASSED",
    photoStatus: "",
    salesStatus: "",
  },
  riskFailed: {
    riskStatus: "FAILED",
    photoStatus: "",
    salesStatus: "",
  },
  photoRejected: {
    riskStatus: "",
    photoStatus: "REJECTED",
    salesStatus: "",
  },
  photoPending: {
    riskStatus: "",
    photoStatus: "PENDING",
    salesStatus: "",
  },
};

function splitStatusFilter(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** 规范化多选状态，便于快捷筛高亮比对 */
export function normalizeStatusFilter(value: string): string {
  return splitStatusFilter(value).sort().join(",");
}

function parseStatusFilter(searchParams: URLSearchParams, key: string): string {
  const multi = parseMultiSearchParam(searchParams, key);
  if (multi && multi.length > 0) return multi.join(",");
  return searchParams.get(key) ?? "";
}

export function buildMetricLedgerHref(
  key: MetricDrilldownKey,
  context: LedgerDrilldownContext = {}
): string {
  const drilldown = METRIC_LEDGER_DRILLDOWNS[key];
  return `/xlh/ledger${ledgerUrlQueryString({
    dateFrom: context.dateFrom ?? "",
    dateTo: context.dateTo ?? "",
    datePreset: context.datePreset ?? "custom",
    search: "",
    managerId: context.managerId ?? "",
    salesUserId: context.salesUserId ?? "",
    opportunityId: context.opportunityId ?? "",
    riskStatus: drilldown.riskStatus,
    photoStatus: drilldown.photoStatus,
    salesStatus: drilldown.salesStatus,
    page: 1,
  })}`;
}

const RISK_SLICE_DRILLDOWN: Record<string, MetricDrilldownKey> = {
  风控通过: "riskPassed",
  审核中: "riskPending",
  风控不通过: "riskFailed",
};

const SALES_FAILURE_SLICE_DRILLDOWN: Record<string, MetricDrilldownKey> = {
  "碰笔/扫码/交易未达标": "salesPending",
  风控不通过: "riskFailed",
  照片未通过: "photoRejected",
  照片审核待定: "photoPending",
};

export function ledgerHrefForRiskSlice(
  name: string,
  context: LedgerDrilldownContext = {}
): string | undefined {
  const key = RISK_SLICE_DRILLDOWN[name];
  return key ? buildMetricLedgerHref(key, context) : undefined;
}

export function ledgerHrefForSalesFailureSlice(
  name: string,
  context: LedgerDrilldownContext = {}
): string | undefined {
  const key = SALES_FAILURE_SLICE_DRILLDOWN[name];
  return key ? buildMetricLedgerHref(key, context) : undefined;
}

export function parseLedgerUrlFilters(
  searchParams: URLSearchParams,
  defaults: Pick<LedgerUrlFilters, "dateFrom" | "dateTo">
): LedgerUrlFilters {
  const presetParam = searchParams.get("preset");
  const datePreset = LEDGER_DATE_PRESETS.has(presetParam as LedgerDatePreset)
    ? (presetParam as LedgerDatePreset)
    : searchParams.get("dateFrom") || searchParams.get("dateTo")
      ? "custom"
      : "month";

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  return {
    dateFrom: searchParams.get("dateFrom") ?? defaults.dateFrom,
    dateTo: searchParams.get("dateTo") ?? defaults.dateTo,
    datePreset,
    search: searchParams.get("search") ?? "",
    managerId: searchParams.get("managerId") ?? "",
    salesUserId: searchParams.get("salesUserId") ?? "",
    opportunityId: searchParams.get("opportunityId") ?? "",
    riskStatus: parseStatusFilter(searchParams, "riskStatus"),
    photoStatus: parseStatusFilter(searchParams, "photoStatus"),
    salesStatus: parseStatusFilter(searchParams, "salesActivationStatus"),
    page,
  };
}

export function buildLedgerUrlSearchParams(filters: LedgerUrlFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.datePreset !== "month") {
    params.set("preset", filters.datePreset);
  }
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.managerId) params.set("managerId", filters.managerId);
  if (filters.salesUserId) params.set("salesUserId", filters.salesUserId);
  if (filters.opportunityId) params.set("opportunityId", filters.opportunityId);

  const riskStatuses = splitStatusFilter(filters.riskStatus);
  const photoStatuses = splitStatusFilter(filters.photoStatus);
  const salesStatuses = splitStatusFilter(filters.salesStatus);
  if (riskStatuses.length > 0) appendMultiSearchParam(params, "riskStatus", riskStatuses);
  if (photoStatuses.length > 0) appendMultiSearchParam(params, "photoStatus", photoStatuses);
  if (salesStatuses.length > 0) {
    appendMultiSearchParam(params, "salesActivationStatus", salesStatuses);
  }

  if (filters.page > 1) params.set("page", String(filters.page));

  return params;
}

export function ledgerUrlQueryString(filters: LedgerUrlFilters): string {
  const params = buildLedgerUrlSearchParams(filters);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasActiveLedgerStatusFilters(filters: LedgerUrlFilters): boolean {
  return Boolean(
    filters.riskStatus ||
      filters.photoStatus ||
      filters.salesStatus ||
      filters.search ||
      filters.managerId ||
      filters.salesUserId ||
      filters.opportunityId
  );
}

export const EMPTY_LEDGER_STATUS_FILTERS = {
  riskStatus: "",
  photoStatus: "",
  salesStatus: "",
  search: "",
  managerId: "",
  salesUserId: "",
  opportunityId: "",
  page: 1,
} as const;
