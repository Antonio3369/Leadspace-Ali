import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { buildTeamDetailsBackHref } from "@/lib/team-details-url";
import { formatDateRangeLabel } from "@/lib/ledger-date";
import { getManagerDashboard, getStaffDashboard } from "@/services/stats";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MemberDetailPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "DIRECTOR" && user.role !== "MANAGER") redirect("/xlh/teams");

  const { id } = await params;
  const query = await searchParams;
  const backHref = buildTeamDetailsBackHref(query);
  const dateOptions = {
    dateFrom: typeof query.dateFrom === "string" ? query.dateFrom : undefined,
    dateTo: typeof query.dateTo === "string" ? query.dateTo : undefined,
  };
  const dateRangeLabel = formatDateRangeLabel(dateOptions.dateFrom ?? "", dateOptions.dateTo ?? "");

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
          backHref={backHref}
          dateRangeLabel={dateRangeLabel}
          dateFrom={dateOptions.dateFrom ?? ""}
          dateTo={dateOptions.dateTo ?? ""}
          ledgerScope={{ managerId: id }}
          salesStaffRanking={{
            periodLabel: salesStaffRanking.rangeLabel,
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
        backHref={backHref}
        dateRangeLabel={dateRangeLabel}
        dateFrom={dateOptions.dateFrom ?? ""}
        dateTo={dateOptions.dateTo ?? ""}
        ledgerScope={{ salesUserId: id }}
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
