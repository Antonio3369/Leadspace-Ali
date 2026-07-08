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
  riskStatuses: string[];
  salesStatuses: string[];
  page: number;
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
    riskStatuses: parseMultiSearchParam(searchParams, "riskStatus") ?? [],
    salesStatuses: parseMultiSearchParam(searchParams, "salesActivationStatus") ?? [],
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
  appendMultiSearchParam(params, "riskStatus", filters.riskStatuses);
  appendMultiSearchParam(params, "salesActivationStatus", filters.salesStatuses);
  if (filters.page > 1) params.set("page", String(filters.page));

  return params;
}

export function ledgerUrlQueryString(filters: LedgerUrlFilters): string {
  const params = buildLedgerUrlSearchParams(filters);
  const query = params.toString();
  return query ? `?${query}` : "";
}
