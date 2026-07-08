import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getOpportunityAnalysisDetail } from "@/services/stats/analytics";
import { OpportunityDetailOverview } from "@/components/opportunities/OpportunityDetailOverview";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: "team" | "personal" }>;
}

export default async function OpportunityDetailPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const queryParams = await searchParams;
  const view = user.role === "SUPERVISOR" ? (queryParams.view ?? "team") : undefined;

  try {
    const { opportunity, metrics, charts } = await getOpportunityAnalysisDetail(
      user,
      decodeURIComponent(id),
      { view }
    );

    return (
      <OpportunityDetailOverview
        user={user}
        opportunityId={opportunity.id}
        opportunityName={opportunity.name}
        activeView={view ?? "team"}
        metrics={metrics}
        charts={charts}
      />
    );
  } catch {
    notFound();
  }
}
