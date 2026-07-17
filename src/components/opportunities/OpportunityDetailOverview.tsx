"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { MetricsGrid } from "@/components/stats/MetricCard";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { PieChartCard } from "@/components/charts/PieChartCard";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { requiresDualView } from "@/lib/permissions";
import {
  opportunitiesUrlQueryString,
  type OpportunitiesUrlFilters,
} from "@/lib/opportunities-url";
import {
  buildMetricLedgerHref,
  ledgerHrefForRiskSlice,
  ledgerHrefForSalesFailureSlice,
} from "@/lib/ledger-url";
import { DateRangeMeta, PageHeader, PageShell } from "@/components/ui/notion";

interface OpportunityDetailOverviewProps {
  user: { role: UserRole };
  opportunityName: string;
  activeView: "team" | "personal";
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
  charts: {
    riskDistribution: { name: string; value: number }[];
    salesFailureDistribution: { name: string; value: number }[];
    dailyTrend: { date: string; expand: number; activated: number }[];
  };
  opportunityId: string;
  filters: OpportunitiesUrlFilters;
}

export function OpportunityDetailOverview({
  user,
  opportunityName,
  activeView,
  metrics,
  charts,
  opportunityId,
  filters,
}: OpportunityDetailOverviewProps) {
  const router = useRouter();
  const showDualView = requiresDualView(user.role);
  const backHref = `/xlh/opportunities${opportunitiesUrlQueryString(filters)}`;

  const ledgerContext = useMemo(
    () => ({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      datePreset: filters.datePreset,
      opportunityId,
    }),
    [filters.dateFrom, filters.dateTo, filters.datePreset, opportunityId]
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

  const pushView = useCallback(
    (view: "team" | "personal") => {
      const next = { ...filters, view };
      router.push(
        `/xlh/opportunities/${encodeURIComponent(opportunityId)}${opportunitiesUrlQueryString(next)}`
      );
    },
    [filters, opportunityId, router]
  );

  return (
    <PageShell>
      <PageHeader
        title={`${opportunityName} · 商机专项`}
        kicker=""
        backHref={backHref}
        meta={<DateRangeMeta dateFrom={filters.dateFrom} dateTo={filters.dateTo} />}
        trailing={showDualView ? <DualViewTabs activeView={activeView} onChange={pushView} /> : undefined}
      />

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
    </PageShell>
  );
}
