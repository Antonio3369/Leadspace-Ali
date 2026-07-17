import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { requiresDualView } from "@/lib/permissions";
import { getCurrentMonthRange, parseDateFromParam, parseDateToParam } from "@/lib/ledger-date";
import { parseOpportunitiesUrlFilters } from "@/lib/opportunities-url";
import { getOpportunityAnalysisList } from "@/services/stats/analytics";
import { OpportunitiesPageContent } from "@/components/opportunities/OpportunitiesPageContent";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rawParams = await searchParams;
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") urlSearchParams.set(key, value);
  }

  const defaultRange = getCurrentMonthRange();
  const filters = parseOpportunitiesUrlFilters(urlSearchParams, defaultRange);
  const activeView =
    user.role === "SUPERVISOR" ? filters.view : ("team" as const);

  const dateFrom = filters.dateFrom ? parseDateFromParam(filters.dateFrom) : undefined;
  const dateTo = filters.dateTo ? parseDateToParam(filters.dateTo) : undefined;

  const { opportunities } = await getOpportunityAnalysisList(user, {
    view: user.role === "SUPERVISOR" ? activeView : undefined,
    dateFrom,
    dateTo,
  });

  return (
    <OpportunitiesPageContent
      activeView={activeView}
      showDualView={requiresDualView(user.role)}
      opportunities={opportunities}
      filters={filters}
    />
  );
}
