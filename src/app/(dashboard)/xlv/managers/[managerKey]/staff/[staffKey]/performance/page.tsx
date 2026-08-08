import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { xlvPath } from "@/lib/business-lines";
import {
  canAccessXlvWorkspace,
  xlvSessionManagerKey,
  xlvSessionStaffKey,
} from "@/services/xlv/xlv-scope";
import { PageShell } from "@/components/ui/notion";
import { XlvStaffMonthlyPerformanceView } from "@/components/xlv/XlvStaffMonthlyPerformanceView";

export default async function XlvStaffMonthlyPerformancePage({
  params,
}: {
  params: Promise<{ managerKey: string; staffKey: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user)) redirect("/");

  const { managerKey: rawManager, staffKey: rawStaff } = await params;
  let managerKey = decodeURIComponent(rawManager);
  const staffKey = decodeURIComponent(rawStaff);

  if (user.role === "MANAGER") {
    const ownManagerKey = xlvSessionManagerKey(user);
    if (
      managerKey !== ownManagerKey &&
      managerKey !== user.id &&
      managerKey !== `name:${user.name}`
    ) {
      redirect(xlvPath());
    }
    managerKey = ownManagerKey;
  }

  if (user.role === "SALES") {
    const ownStaffKey = xlvSessionStaffKey(user);
    if (
      staffKey !== ownStaffKey &&
      staffKey !== user.id &&
      staffKey !== `name:${user.name}`
    ) {
      redirect(xlvPath());
    }
  }

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <XlvStaffMonthlyPerformanceView
        managerKey={managerKey}
        staffKey={staffKey}
        backHref={
          user.role === "MANAGER"
            ? xlvPath("/board")
            : user.role === "SALES"
              ? xlvPath("/daily")
              : xlvPath("/board")
        }
      />
    </Suspense>
  );
}
