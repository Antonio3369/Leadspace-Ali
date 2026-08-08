import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessBusinessLine } from "@/lib/business-lines";
import {
  canAccessXlvWorkspace,
  canViewXlv,
  xlvSessionManagerKey,
} from "@/services/xlv/xlv-scope";
import { PageShell } from "@/components/ui/notion";
import { XlvDailyView } from "@/components/xlv/XlvDailyView";

export default async function XlvDailyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");

  if (canViewXlv(user.role) && !canAccessBusinessLine(user.role, user.businessLines, "xlv")) {
    redirect("/");
  }
  if (!canAccessXlvWorkspace(user)) redirect("/");

  const managerKey =
    user.role === "MANAGER" || user.role === "SALES"
      ? xlvSessionManagerKey(user)
      : null;

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <XlvDailyView role={user.role} managerKey={managerKey} />
    </Suspense>
  );
}
