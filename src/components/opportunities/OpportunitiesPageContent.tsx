"use client";

import { useRouter } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { DualViewTabs } from "@/components/layout/DualViewTabs";
import { OpportunitiesListTable } from "@/components/opportunities/OpportunitiesListTable";
import type { OpportunityListItem } from "@/services/stats/analytics";
import { requiresDualView } from "@/lib/permissions";

interface OpportunitiesPageContentProps {
  user: { role: UserRole };
  activeView: "team" | "personal";
  opportunities: OpportunityListItem[];
}

export function OpportunitiesPageContent({
  user,
  activeView,
  opportunities,
}: OpportunitiesPageContentProps) {
  const router = useRouter();
  const showDualView = requiresDualView(user.role);
  const viewQuery = activeView === "personal" ? "?view=personal" : "";

  function handleViewChange(view: "team" | "personal") {
    const q = view === "personal" ? "?view=personal" : "";
    router.push(`/opportunities${q}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-semibold text-gray-900">商机专项分析</h1>
        {showDualView && (
          <DualViewTabs activeView={activeView} onChange={handleViewChange} />
        )}
      </div>

      <OpportunitiesListTable data={opportunities} viewQuery={viewQuery} />
    </div>
  );
}
