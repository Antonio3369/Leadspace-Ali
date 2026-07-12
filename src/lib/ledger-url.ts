import type { LedgerDatePreset } from "@/lib/ledger-date";
import { parseMultiSearchParam } from "@/lib/query-params";

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
  riskStatus: string;
  photoStatus: string;
  salesStatus: string;
  page: number;
}

function parseSingleFilter(searchParams: URLSearchParams, key: string): string {
  const multi = parseMultiSearchParam(searchParams, key);
  if (multi && multi.length > 0) return multi[0]!;
  return searchParams.get(key) ?? "";
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
    riskStatus: parseSingleFilter(searchParams, "riskStatus"),
    photoStatus: parseSingleFilter(searchParams, "photoStatus"),
    salesStatus: parseSingleFilter(searchParams, "salesActivationStatus"),
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
  if (filters.riskStatus) params.set("riskStatus", filters.riskStatus);
  if (filters.photoStatus) params.set("photoStatus", filters.photoStatus);
  if (filters.salesStatus) params.set("salesActivationStatus", filters.salesStatus);
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
      filters.salesUserId
  );
}

export const EMPTY_LEDGER_STATUS_FILTERS = {
  riskStatus: "",
  photoStatus: "",
  salesStatus: "",
  search: "",
  managerId: "",
  salesUserId: "",
  page: 1,
} as const;
