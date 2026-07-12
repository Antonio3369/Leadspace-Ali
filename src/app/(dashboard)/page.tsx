import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurrentMonthRange, parseDateFromParam, parseDateToParam } from "@/lib/ledger-date";
import { parseDashboardUrlFilters } from "@/lib/dashboard-url";
import { getDashboardBundle } from "@/services/stats/analytics";
import { DashboardView } from "@/components/dashboard/DashboardView";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rawParams = await searchParams;
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") urlSearchParams.set(key, value);
  }

  const defaultRange = getCurrentMonthRange();
  const filters = parseDashboardUrlFilters(urlSearchParams, defaultRange);
  const activeView =
    user.role === "SUPERVISOR" ? filters.view : ("team" as const);

  const dateFrom = filters.dateFrom ? parseDateFromParam(filters.dateFrom) : undefined;
  const dateTo = filters.dateTo ? parseDateToParam(filters.dateTo) : undefined;

  const { metrics, alert, charts } = await getDashboardBundle(user, {
    view: user.role === "SUPERVISOR" ? activeView : undefined,
    dateFrom,
    dateTo,
  });

  return (
    <DashboardView
      user={user}
      metrics={metrics}
      alert={alert}
      activeView={activeView}
      charts={charts}
      filters={filters}
      pageTitle={user.role === "MANAGER" ? "团队数据总览" : "数据总览"}
    />
  );
}
