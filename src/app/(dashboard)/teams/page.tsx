import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { resolveMonthParam } from "@/lib/ledger-date";
import {
  getManagerTeamMonthlyRanking,
  getSalesStaffMonthlyRankingForManager,
} from "@/services/stats/analytics";
import { ManagerTeamRankingTable } from "@/components/charts/ManagerTeamRankingTable";
import { SalesStaffRankingTable } from "@/components/charts/SalesStaffRankingTable";
import { TeamsPageHeader } from "@/components/teams/TeamsPageHeader";

interface PageProps {
  searchParams: Promise<{ view?: "team" | "personal"; month?: string }>;
}

export default async function TeamsPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const view = user.role === "SUPERVISOR" ? (params.view ?? "team") : undefined;
  const month = resolveMonthParam(params.month);

  if (user.role === "SALES" || (user.role === "SUPERVISOR" && view === "personal")) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">团队排行</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-12 text-center text-gray-400 text-sm">
          当前角色暂无可查看的团队排行
        </div>
      </div>
    );
  }

  if (user.role === "MANAGER") {
    const { monthLabel, monthParam, ranking } = await getSalesStaffMonthlyRankingForManager(
      user.id,
      month
    );

    return (
      <div className="space-y-4">
        <TeamsPageHeader month={monthParam} monthLabel={monthLabel} />
        <SalesStaffRankingTable
          title="团队成员拓展排名"
          monthLabel={monthLabel}
          data={ranking}
        />
      </div>
    );
  }

  const { monthLabel, monthParam, ranking } = await getManagerTeamMonthlyRanking(user, month);

  return (
    <div className="space-y-4">
      <TeamsPageHeader month={monthParam} monthLabel={monthLabel} />
      <ManagerTeamRankingTable monthLabel={monthLabel} data={ranking} />
    </div>
  );
}
