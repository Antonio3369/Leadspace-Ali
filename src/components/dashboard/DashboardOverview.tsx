"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { MetricsGrid } from "@/components/stats/MetricCard";
import { AlertBanner } from "@/components/stats/AlertBanner";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { PieChartCard } from "@/components/charts/PieChartCard";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { OpportunityStatsTable } from "@/components/charts/OpportunityStatsTable";
import { ManagerTeamRankingTable } from "@/components/charts/ManagerTeamRankingTable";
import type { ManagerTeamRankingItem } from "@/components/charts/ManagerTeamRankingTable";
import { SalesStaffRankingTable } from "@/components/charts/SalesStaffRankingTable";
import type { SalesStaffRankingItem } from "@/components/charts/SalesStaffRankingTable";
import { requiresDualView } from "@/lib/permissions";

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
    monthLabel: string;
    data: SalesStaffRankingItem[];
  };
  pageTitle?: string;
  hideManagerRanking?: boolean;
  backHref?: string;
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
}: DashboardOverviewProps) {
  const router = useRouter();
  const showDualView = requiresDualView(user.role);

  function handleViewChange(view: "team" | "personal") {
    router.push(`/?view=${view}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="text-sm text-gray-500 hover:text-[#165DFF] transition-colors"
            >
              ← 返回
            </Link>
          )}
          <h1 className="text-xl font-semibold text-gray-900">{pageTitle}</h1>
        </div>
        {showDualView && (
          <DualViewTabs activeView={activeView} onChange={handleViewChange} />
        )}
      </div>

      <AlertBanner message={alert.message} visible={alert.visible} />
      <MetricsGrid metrics={metrics} />

      {salesStaffRanking && (
        <SalesStaffRankingTable
          monthLabel={salesStaffRanking.monthLabel}
          data={salesStaffRanking.data}
        />
      )}

      {managerRanking && !hideManagerRanking && (
        <ManagerTeamRankingTable
          monthLabel={managerRanking.monthLabel}
          data={managerRanking.data}
          highlightManagerName={
            user.role === "MANAGER" ? user.name : undefined
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="风控状态分布" data={charts.riskDistribution} />
        <PieChartCard title="动销未达标原因分布" data={charts.salesFailureDistribution} />
      </div>

      <DailyTrendChart data={charts.dailyTrend} />
      <OpportunityStatsTable data={charts.opportunityStats} />
    </div>
  );
}
