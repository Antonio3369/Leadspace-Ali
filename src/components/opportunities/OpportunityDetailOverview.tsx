"use client";

import { useCallback } from "react";
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
  const backHref = `/opportunities${opportunitiesUrlQueryString(filters)}`;

  const pushView = useCallback(
    (view: "team" | "personal") => {
      const next = { ...filters, view };
      router.push(
        `/opportunities/${encodeURIComponent(opportunityId)}${opportunitiesUrlQueryString(next)}`
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

      <MetricsGrid metrics={metrics} />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="风控状态分布" data={charts.riskDistribution} />
        <PieChartCard title="动销未达标原因分布" data={charts.salesFailureDistribution} />
      </section>

      <DailyTrendChart data={charts.dailyTrend} />
    </PageShell>
  );
}
