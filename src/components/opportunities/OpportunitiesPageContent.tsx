"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { OpportunitiesListTable } from "@/components/opportunities/OpportunitiesListTable";
import type { OpportunityListItem } from "@/services/stats/analytics";
import { getPresetRange, type LedgerDatePreset } from "@/lib/ledger-date";
import {
  opportunitiesUrlQueryString,
  type OpportunitiesUrlFilters,
} from "@/lib/opportunities-url";
import {
  DateFilterBar,
  DateRangeMeta,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";

interface OpportunitiesPageContentProps {
  activeView: "team" | "personal";
  showDualView: boolean;
  opportunities: OpportunityListItem[];
  filters: OpportunitiesUrlFilters;
}

export function OpportunitiesPageContent({
  activeView,
  showDualView,
  opportunities,
  filters,
}: OpportunitiesPageContentProps) {
  const router = useRouter();
  const listQuery = opportunitiesUrlQueryString(filters);

  const pushFilters = useCallback(
    (patch: Partial<OpportunitiesUrlFilters>) => {
      const next = { ...filters, ...patch };
      router.replace(`/xlh/opportunities${opportunitiesUrlQueryString(next)}`, { scroll: false });
    },
    [filters, router]
  );

  function applyPreset(preset: LedgerDatePreset) {
    const range = getPresetRange(preset);
    pushFilters({
      datePreset: preset,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    });
  }

  function handleViewChange(view: "team" | "personal") {
    pushFilters({ view });
  }

  return (
    <PageShell>
      <PageHeader
        title="商机专项分析"
        kicker=""
        meta={<DateRangeMeta dateFrom={filters.dateFrom} dateTo={filters.dateTo} />}
        trailing={showDualView ? <DualViewTabs activeView={activeView} onChange={handleViewChange} /> : undefined}
      />

      <DateFilterBar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        datePreset={filters.datePreset}
        onPreset={applyPreset}
        onDateFrom={(value) => pushFilters({ dateFrom: value, datePreset: "custom" })}
        onDateTo={(value) => pushFilters({ dateTo: value, datePreset: "custom" })}
      />

      <OpportunitiesListTable data={opportunities} viewQuery={listQuery} />
    </PageShell>
  );
}
