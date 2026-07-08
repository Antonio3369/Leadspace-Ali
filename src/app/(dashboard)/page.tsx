import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardBundle } from "@/services/stats/analytics";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

interface PageProps {
  searchParams: Promise<{ view?: "team" | "personal" }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const view = user.role === "SUPERVISOR" ? (params.view ?? "team") : undefined;

  const { metrics, alert, charts } = await getDashboardBundle(user, { view });

  return (
    <DashboardOverview
      user={user}
      metrics={metrics}
      alert={alert}
      activeView={view ?? "team"}
      pageTitle={user.role === "MANAGER" ? "团队数据总览" : "数据总览"}
      charts={charts}
    />
  );
}
