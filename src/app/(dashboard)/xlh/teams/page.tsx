import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { TeamDetailsView } from "@/components/teams/TeamDetailsView";

export default async function TeamsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <Suspense fallback={<p className="text-sm text-gray-400 py-8">加载中...</p>}>
      <TeamDetailsView role={user.role} />
    </Suspense>
  );
}
