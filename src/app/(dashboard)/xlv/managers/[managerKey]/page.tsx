import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { xlvPath } from "@/lib/business-lines";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { PageShell } from "@/components/ui/notion";
import { XlvStaffBoard } from "@/components/xlv/XlvStaffBoard";

export default async function XlvManagerStaffPage({
  params,
}: {
  params: Promise<{ managerKey: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user)) redirect("/");

  const { managerKey: raw } = await params;
  let managerKey = decodeURIComponent(raw);

  if (user.role === "MANAGER") {
    if (managerKey !== user.id && managerKey !== `name:${user.name}`) {
      redirect(xlvPath());
    }
    managerKey = user.id;
  }

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <XlvStaffBoard managerKey={managerKey} variant="drilldown" />
    </Suspense>
  );
}
