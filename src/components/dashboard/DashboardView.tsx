"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { AlertBanner } from "@/components/stats/AlertBanner";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { PieChartCard } from "@/components/charts/PieChartCard";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { OpportunityStatsTable } from "@/components/charts/OpportunityStatsTable";
import { CORE_METRICS } from "@/lib/constants";
import { getPresetRange, type LedgerDatePreset } from "@/lib/ledger-date";
import {
  dashboardUrlQueryString,
  type DashboardUrlFilters,
} from "@/lib/dashboard-url";
import { requiresDualView } from "@/lib/permissions";
import {
  DateFilterBar,
  DateRangeMeta,
  NotionStatCard,
  NotionStatGrid,
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

  const statItems = useMemo(
    () => [
      { label: CORE_METRICS.TOTAL_MERCHANTS, value: metrics.totalMerchants },
      { label: CORE_METRICS.PHOTO_PASS_RATE, value: metrics.photoPassRate, isRate: true, suffix: "%" },
      { label: CORE_METRICS.SALES_ACTIVATION_RATE, value: metrics.salesActivationRate, isRate: true, suffix: "%" },
      { label: CORE_METRICS.RISK_COMPLIANCE_RATE, value: metrics.riskComplianceRate, isRate: true, suffix: "%" },
      { label: CORE_METRICS.RISK_UNDER_REVIEW, value: metrics.riskUnderReview },
      { label: CORE_METRICS.RISK_REVIEW_ACTIVATED, value: metrics.riskReviewActivated },
      { label: CORE_METRICS.RISK_FAILED, value: metrics.riskFailed },
      { label: CORE_METRICS.ESTIMATED_RISK_RATE, value: metrics.estimatedRiskRate, isRate: true, suffix: "%" },
    ],
    [metrics]
  );

  const pushFilters = useCallback(
    (patch: Partial<DashboardUrlFilters>) => {
      const next = { ...filters, ...patch };
      router.replace(`/${dashboardUrlQueryString(next)}`, { scroll: false });
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

      <NotionStatGrid>
        {statItems.map((item) => (
          <NotionStatCard
            key={item.label}
            label={item.label}
            value={item.value}
            isRate={item.isRate}
            suffix={item.suffix}
          />
        ))}
      </NotionStatGrid>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="风控状态分布" data={charts.riskDistribution} />
        <PieChartCard title="动销未达标原因分布" data={charts.salesFailureDistribution} />
      </section>

      <DailyTrendChart data={charts.dailyTrend} />

      <section className="rounded-[14px] overflow-hidden border border-[#eef2f7] bg-white shadow-sm">
        <OpportunityStatsTable data={charts.opportunityStats} />
      </section>
    </PageShell>
  );
}
