"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { AlertBanner } from "@/components/stats/AlertBanner";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { PieChartCard } from "@/components/charts/PieChartCard";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { OpportunityStatsTable } from "@/components/charts/OpportunityStatsTable";
import { ManagerTeamRankingTable } from "@/components/charts/ManagerTeamRankingTable";
import type { ManagerTeamRankingItem } from "@/components/charts/ManagerTeamRankingTable";
import { SalesStaffRankingTable } from "@/components/charts/SalesStaffRankingTable";
import type { SalesStaffRankingItem } from "@/components/charts/SalesStaffRankingTable";
import { MetricsGrid } from "@/components/stats/MetricCard";
import type { LedgerDatePreset } from "@/lib/ledger-date";
import {
  buildMetricLedgerHref,
  ledgerHrefForRiskSlice,
  ledgerHrefForSalesFailureSlice,
} from "@/lib/ledger-url";
import { requiresDualView } from "@/lib/permissions";
import { DateRangeMeta, PageHeader, PageShell } from "@/components/ui/notion";

interface DashboardOverviewProps {
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
  managerRanking?: {
    monthLabel: string;
    data: ManagerTeamRankingItem[];
  };
  salesStaffRanking?: {
    periodLabel: string;
    data: SalesStaffRankingItem[];
  };
  pageTitle?: string;
  hideManagerRanking?: boolean;
  backHref?: string;
  dateRangeLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  datePreset?: LedgerDatePreset;
  ledgerScope?: {
    managerId?: string;
    salesUserId?: string;
  };
}

export function DashboardOverview({
  user,
  metrics,
  alert,
  activeView,
  charts,
  managerRanking,
  salesStaffRanking,
  pageTitle = "数据总览",
  hideManagerRanking = false,
  backHref,
  dateRangeLabel,
  dateFrom = "",
  dateTo = "",
  datePreset = "custom",
  ledgerScope,
}: DashboardOverviewProps) {
  const router = useRouter();
  const showDualView = requiresDualView(user.role);

  const ledgerContext = useMemo(
    () => ({
      dateFrom,
      dateTo,
      datePreset,
      managerId: ledgerScope?.managerId,
      salesUserId: ledgerScope?.salesUserId,
    }),
    [dateFrom, dateTo, datePreset, ledgerScope?.managerId, ledgerScope?.salesUserId]
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

  function handleViewChange(view: "team" | "personal") {
    router.push(`/xlh?view=${view}`, { scroll: false });
  }

  const meta = dateRangeLabel ? (
    <p>
      数据范围：<span className="font-medium text-[#111827]">{dateRangeLabel}</span>
    </p>
  ) : dateFrom || dateTo ? (
    <DateRangeMeta dateFrom={dateFrom} dateTo={dateTo} />
  ) : undefined;

  return (
    <PageShell>
      <PageHeader
        title={pageTitle}
        backHref={backHref}
        meta={meta}
        trailing={showDualView ? <DualViewTabs activeView={activeView} onChange={handleViewChange} /> : undefined}
      />

      <AlertBanner message={alert.message} visible={alert.visible} />
      <MetricsGrid metrics={metrics} ledgerContext={ledgerContext} />

      {salesStaffRanking && (
        <SalesStaffRankingTable
          periodLabel={salesStaffRanking.periodLabel}
          data={salesStaffRanking.data}
        />
      )}

      {managerRanking && !hideManagerRanking && (
        <ManagerTeamRankingTable
          monthLabel={managerRanking.monthLabel}
          data={managerRanking.data}
          highlightManagerName={user.role === "MANAGER" ? user.name : undefined}
        />
      )}

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
