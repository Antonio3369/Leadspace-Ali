import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessN7Workspace } from "@/services/n7/n7-scope";
import { PageShell } from "@/components/ui/notion";
import { N7StaffDevicesView } from "@/components/n7/N7StaffDevicesView";

export default async function N7StaffDevicesPage({
  params,
}: {
  params: Promise<{ managerKey: string; staffKey: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessN7Workspace(user)) redirect("/");

  const { managerKey: rawManager, staffKey: rawStaff } = await params;
  let managerKey = decodeURIComponent(rawManager);
  const staffKey = decodeURIComponent(rawStaff);

  if (user.role === "MANAGER") {
    if (managerKey !== user.id && managerKey !== `name:${user.name}`) {
      redirect("/n7");
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
      <N7StaffDevicesView
        managerKey={managerKey}
        staffKey={staffKey}
        backHref={user.role === "MANAGER" ? "/n7" : undefined}
      />
    </Suspense>
  );
}
