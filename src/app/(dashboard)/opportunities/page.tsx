import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getOpportunityAnalysisList } from "@/services/stats/analytics";
import { OpportunitiesPageContent } from "@/components/opportunities/OpportunitiesPageContent";

interface PageProps {
  searchParams: Promise<{ view?: "team" | "personal" }>;
}

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const view = user.role === "SUPERVISOR" ? (params.view ?? "team") : undefined;

  const { opportunities } = await getOpportunityAnalysisList(user, { view });

  return (
    <OpportunitiesPageContent
      user={user}
      activeView={view ?? "team"}
      opportunities={opportunities}
    />
  );
}
