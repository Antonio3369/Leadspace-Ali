import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurrentMonthRange, parseDateFromParam, parseDateToParam } from "@/lib/ledger-date";
import { parseOpportunitiesUrlFilters } from "@/lib/opportunities-url";
import { getOpportunityAnalysisDetail } from "@/services/stats/analytics";
import { OpportunityDetailOverview } from "@/components/opportunities/OpportunityDetailOverview";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OpportunityDetailPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const rawParams = await searchParams;
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") urlSearchParams.set(key, value);
  }

  const defaultRange = getCurrentMonthRange();
  const filters = parseOpportunitiesUrlFilters(urlSearchParams, defaultRange);
  const view = user.role === "SUPERVISOR" ? filters.view : undefined;

  const dateFrom = filters.dateFrom ? parseDateFromParam(filters.dateFrom) : undefined;
  const dateTo = filters.dateTo ? parseDateToParam(filters.dateTo) : undefined;

  try {
    const { opportunity, metrics, charts } = await getOpportunityAnalysisDetail(
      user,
      decodeURIComponent(id),
      {
        view,
        dateFrom,
        dateTo,
      }
    );

    return (
      <OpportunityDetailOverview
        user={user}
        opportunityId={opportunity.id}
        opportunityName={opportunity.name}
        activeView={filters.view}
        metrics={metrics}
        charts={charts}
        filters={filters}
      />
    );
  } catch {
    notFound();
  }
}
