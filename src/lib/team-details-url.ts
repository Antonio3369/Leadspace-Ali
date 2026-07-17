import type { LedgerDatePreset } from "@/lib/ledger-date";
import { DEFAULT_TEAM_DETAIL_SORT, parseTeamDetailSort, type TeamDetailSortKey } from "@/lib/team-details";

const LEDGER_DATE_PRESETS = new Set<LedgerDatePreset>([
  "month",
  "lastMonth",
  "30d",
  "90d",
  "all",
  "custom",
]);

export interface TeamDetailsUrlFilters {
  dateFrom: string;
  dateTo: string;
  datePreset: LedgerDatePreset;
  search: string;
  sortBy: TeamDetailSortKey;
}

export function parseTeamDetailsUrlFilters(
  searchParams: URLSearchParams,
  defaults: Pick<TeamDetailsUrlFilters, "dateFrom" | "dateTo">
): TeamDetailsUrlFilters {
  const presetParam = searchParams.get("preset");
  const datePreset = LEDGER_DATE_PRESETS.has(presetParam as LedgerDatePreset)
    ? (presetParam as LedgerDatePreset)
    : searchParams.get("dateFrom") || searchParams.get("dateTo")
      ? "custom"
      : "month";

  return {
    dateFrom: searchParams.get("dateFrom") ?? defaults.dateFrom,
    dateTo: searchParams.get("dateTo") ?? defaults.dateTo,
    datePreset,
    search: searchParams.get("search") ?? "",
    sortBy: parseTeamDetailSort(searchParams.get("sortBy")),
  };
}

export function buildTeamDetailsUrlSearchParams(filters: TeamDetailsUrlFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.datePreset !== "month") {
    params.set("preset", filters.datePreset);
  }
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.sortBy !== DEFAULT_TEAM_DETAIL_SORT) {
    params.set("sortBy", filters.sortBy);
  }

  return params;
}

export const TEAM_DETAILS_FILTERS_STORAGE_KEY = "team-details-filters";

/** 优先 URLSearchParams，回退到地址栏 query（避免返回时 useSearchParams 短暂为空） */
export function resolveTeamDetailsSearchParams(
  urlSearchParams: URLSearchParams
): URLSearchParams {
  if (urlSearchParams.toString()) return urlSearchParams;

  if (typeof window !== "undefined") {
    const fromLocation = new URLSearchParams(window.location.search);
    if (fromLocation.toString()) return fromLocation;

    const stored = sessionStorage.getItem(TEAM_DETAILS_FILTERS_STORAGE_KEY);
    if (stored) return new URLSearchParams(stored);
  }

  return urlSearchParams;
}

export function persistTeamDetailsFilters(filters: TeamDetailsUrlFilters) {
  if (typeof window === "undefined") return;
  const query = buildTeamDetailsUrlSearchParams(filters).toString();
  if (query) {
    sessionStorage.setItem(TEAM_DETAILS_FILTERS_STORAGE_KEY, query);
  } else {
    sessionStorage.removeItem(TEAM_DETAILS_FILTERS_STORAGE_KEY);
  }
}

export function teamDetailsUrlQueryString(filters: TeamDetailsUrlFilters): string {
  const query = buildTeamDetailsUrlSearchParams(filters).toString();
  return query ? `?${query}` : "";
}

/** 从详情页返回团队明细时，保留完整筛选状态 */
export function buildTeamDetailsBackHref(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>
): string {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(
          Object.entries(searchParams).flatMap(([key, value]) => {
            if (typeof value === "string" && value) return [[key, value]];
            if (Array.isArray(value)) {
              return value.filter(Boolean).map((item) => [key, item]);
            }
            return [];
          })
        );

  const kept = new URLSearchParams();
  for (const key of ["preset", "dateFrom", "dateTo", "search", "sortBy"] as const) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }

  const query = kept.toString();
  return query ? `/xlh/teams?${query}` : "/xlh/teams";
}

export function buildTeamDetailsBackHrefFromFilters(filters: TeamDetailsUrlFilters): string {
  const query = buildTeamDetailsUrlSearchParams(filters).toString();
  return query ? `/xlh/teams?${query}` : "/xlh/teams";
}
