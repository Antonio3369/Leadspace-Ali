"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { MetricsGrid } from "@/components/stats/MetricCard";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { PieChartCard } from "@/components/charts/PieChartCard";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { requiresDualView } from "@/lib/permissions";

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
}

export function OpportunityDetailOverview({
  user,
  opportunityName,
  activeView,
  metrics,
  charts,
  opportunityId,
}: OpportunityDetailOverviewProps) {
  const router = useRouter();
  const showDualView = requiresDualView(user.role);
  const viewQuery = activeView === "personal" ? "?view=personal" : "";

  function handleViewChange(view: "team" | "personal") {
    const q = view === "personal" ? "?view=personal" : "";
    router.push(`/opportunities/${encodeURIComponent(opportunityId)}${q}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/opportunities${viewQuery}`}
            className="text-sm text-gray-500 hover:text-[#165DFF] transition-colors"
          >
            ← 返回
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">
            {opportunityName} · 商机专项
          </h1>
        </div>
        {showDualView && (
          <DualViewTabs activeView={activeView} onChange={handleViewChange} />
        )}
      </div>

      <MetricsGrid metrics={metrics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="风控状态分布" data={charts.riskDistribution} />
        <PieChartCard title="动销未达标原因分布" data={charts.salesFailureDistribution} />
      </div>

      <DailyTrendChart data={charts.dailyTrend} />
    </div>
  );
}
