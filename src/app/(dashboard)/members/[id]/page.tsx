import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getManagerDashboard, getStaffDashboard } from "@/services/stats";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}

export default async function MemberDetailPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "DIRECTOR" && user.role !== "MANAGER") redirect("/members");

  const { id } = await params;
  const query = await searchParams;
  const dateOptions = {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };

  try {
    if (user.role === "DIRECTOR") {
      const { manager, metrics, alert, charts, salesStaffRanking } = await getManagerDashboard(
        user,
        id,
        dateOptions
      );

      return (
        <DashboardOverview
          user={user}
          metrics={metrics}
          alert={alert}
          activeView="team"
          pageTitle={`${manager.name} · 数据总览`}
          hideManagerRanking
          backHref="/members"
          salesStaffRanking={{
            monthLabel: salesStaffRanking.monthLabel,
            data: salesStaffRanking.ranking,
          }}
          charts={{
            riskDistribution: charts.riskDistribution,
            salesFailureDistribution: charts.salesFailureDistribution,
            opportunityStats: charts.opportunityStats,
            dailyTrend: charts.dailyTrend,
          }}
        />
      );
    }

    const { staff, metrics, alert, charts } = await getStaffDashboard(user, id, dateOptions);

    return (
      <DashboardOverview
        user={user}
        metrics={metrics}
        alert={alert}
        activeView="personal"
        pageTitle={`${staff.name} · 数据总览`}
        hideManagerRanking
        backHref={
          query.dateFrom || query.dateTo
            ? `/members?dateFrom=${query.dateFrom ?? ""}&dateTo=${query.dateTo ?? ""}`
            : "/members"
        }
        charts={{
          riskDistribution: charts.riskDistribution,
          salesFailureDistribution: charts.salesFailureDistribution,
          opportunityStats: charts.opportunityStats,
          dailyTrend: charts.dailyTrend,
        }}
      />
    );
  } catch {
    notFound();
  }
}
