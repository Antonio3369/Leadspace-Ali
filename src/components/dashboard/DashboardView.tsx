"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { AlertBanner } from "@/components/stats/AlertBanner";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { PieChartCard } from "@/components/charts/PieChartCard";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { OpportunityStatsTable } from "@/components/charts/OpportunityStatsTable";
import { MetricsGrid } from "@/components/stats/MetricCard";
import { getPresetRange, type LedgerDatePreset } from "@/lib/ledger-date";
import {
  dashboardUrlQueryString,
  type DashboardUrlFilters,
} from "@/lib/dashboard-url";
import {
  buildMetricLedgerHref,
  ledgerHrefForRiskSlice,
  ledgerHrefForSalesFailureSlice,
} from "@/lib/ledger-url";
import { requiresDualView } from "@/lib/permissions";
import {
  DateFilterBar,
  DateRangeMeta,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";

interface DashboardViewProps {
  user: { role: UserRole; name: string };
  metrics: {
    totalMerchants: number;
    photoPassRate: number;
    salesActivationRate: number;
    riskComplianceRate: number;
    riskUnderReview: number;
    riskReviewActivated: number;
    riskFailed: number;
    estimatedRiskRate: number;
  };
  alert: { visible: boolean; message: string };
  activeView: "team" | "personal";
  charts: {
    riskDistribution: { name: string; value: number }[];
    salesFailureDistribution: { name: string; value: number }[];
    opportunityStats: {
      name: string;
      totalMerchants: number;
      photoPassRate: number;
      salesActivationRate: number;
      riskComplianceRate: number;
      estimatedRiskRate: number;
    }[];
    dailyTrend: { date: string; expand: number; activated: number }[];
  };
  filters: DashboardUrlFilters;
  pageTitle: string;
}

export function DashboardView({
  user,
  metrics,
  alert,
  activeView,
  charts,
  filters,
  pageTitle,
}: DashboardViewProps) {
  const router = useRouter();
  const showDualView = requiresDualView(user.role);

  const ledgerContext = useMemo(
    () => ({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      datePreset: filters.datePreset,
    }),
    [filters.dateFrom, filters.dateTo, filters.datePreset]
  );

  const p2Count = Math.max(0, metrics.riskUnderReview - metrics.riskReviewActivated);
  const p2Href = buildMetricLedgerHref("riskPendingNotActivated", ledgerContext);

  const riskSliceHref = useCallback(
    (name: string) => ledgerHrefForRiskSlice(name, ledgerContext),
    [ledgerContext]
  );
  const salesFailureSliceHref = useCallback(
    (name: string) => ledgerHrefForSalesFailureSlice(name, ledgerContext),
    [ledgerContext]
  );

  const pushFilters = useCallback(
    (patch: Partial<DashboardUrlFilters>) => {
      const next = { ...filters, ...patch };
      router.replace(`/xlh${dashboardUrlQueryString(next)}`, { scroll: false });
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
        title={pageTitle}
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

      <AlertBanner message={alert.message} visible={alert.visible} />

      <MetricsGrid metrics={metrics} ledgerContext={ledgerContext} />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard
          title="风控状态分布"
          data={charts.riskDistribution}
          getSliceHref={riskSliceHref}
          footerLink={
            p2Count > 0
              ? { href: p2Href, label: `查看审核中未动销 ${p2Count.toLocaleString()} →` }
              : undefined
          }
        />
        <PieChartCard
          title="动销未达标原因分布"
          data={charts.salesFailureDistribution}
          getSliceHref={salesFailureSliceHref}
        />
      </section>

      <DailyTrendChart data={charts.dailyTrend} />

      <section className="rounded-[14px] overflow-hidden border border-[#eef2f7] bg-white shadow-sm">
        <OpportunityStatsTable data={charts.opportunityStats} />
      </section>
    </PageShell>
  );
}
