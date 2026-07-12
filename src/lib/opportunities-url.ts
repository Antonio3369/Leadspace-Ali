import type { LedgerDatePreset } from "@/lib/ledger-date";

const DATE_PRESETS = new Set<LedgerDatePreset>([
  "month",
  "lastMonth",
  "30d",
  "90d",
  "all",
  "custom",
]);

export interface OpportunitiesUrlFilters {
  dateFrom: string;
  dateTo: string;
  datePreset: LedgerDatePreset;
  view: "team" | "personal";
}

export function parseOpportunitiesUrlFilters(
  searchParams: URLSearchParams,
  defaults: Pick<OpportunitiesUrlFilters, "dateFrom" | "dateTo">
): OpportunitiesUrlFilters {
  const presetParam = searchParams.get("preset");
  const datePreset = DATE_PRESETS.has(presetParam as LedgerDatePreset)
    ? (presetParam as LedgerDatePreset)
    : searchParams.get("dateFrom") || searchParams.get("dateTo")
      ? "custom"
      : "month";

  const viewParam = searchParams.get("view");
  const view = viewParam === "personal" ? "personal" : "team";

  return {
    dateFrom: searchParams.get("dateFrom") ?? defaults.dateFrom,
    dateTo: searchParams.get("dateTo") ?? defaults.dateTo,
    datePreset,
    view,
  };
}

export function buildOpportunitiesUrlSearchParams(
  filters: OpportunitiesUrlFilters
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.datePreset !== "month") {
    params.set("preset", filters.datePreset);
  }
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.view === "personal") params.set("view", "personal");

  return params;
}

export function opportunitiesUrlQueryString(filters: OpportunitiesUrlFilters): string {
  const qs = buildOpportunitiesUrlSearchParams(filters).toString();
  return qs ? `?${qs}` : "";
}
