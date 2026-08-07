import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { xlvPath } from "@/lib/business-lines";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { PageShell } from "@/components/ui/notion";
import { XlvStaffDevicesView } from "@/components/xlv/XlvStaffDevicesView";

export default async function XlvStaffDevicesPage({
  params,
}: {
  params: Promise<{ managerKey: string; staffKey: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessXlvWorkspace(user)) redirect("/");

  const { managerKey: rawManager, staffKey: rawStaff } = await params;
  let managerKey = decodeURIComponent(rawManager);
  const staffKey = decodeURIComponent(rawStaff);

  if (user.role === "MANAGER") {
    if (managerKey !== user.id && managerKey !== `name:${user.name}`) {
      redirect(xlvPath());
    }
    managerKey = user.id;
  }

  if (user.role === "SALES") {
    if (staffKey !== user.id && staffKey !== `name:${user.name}`) {
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
      <XlvStaffDevicesView
        managerKey={managerKey}
        staffKey={staffKey}
        backHref={
          user.role === "MANAGER"
            ? xlvPath("/board")
            : user.role === "SALES"
              ? xlvPath()
              : undefined
        }
      />
    </Suspense>
  );
}
