import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessN7Workspace } from "@/services/n7/n7-scope";
import { PageShell } from "@/components/ui/notion";
import { N7StaffBoard } from "@/components/n7/N7StaffBoard";

export default async function N7ManagerStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ managerKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessN7Workspace(user)) redirect("/");

  const { managerKey: raw } = await params;
  const managerKey = decodeURIComponent(raw);
  const sp = await searchParams;

  if (user.role === "MANAGER") {
    if (managerKey !== user.id && managerKey !== `name:${user.name}`) {
      redirect("/n7");
    }
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === "string") qs.set(key, value);
      else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
    }
    const q = qs.toString();
    redirect(q ? `/n7?${q}` : "/n7");
  }

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <N7StaffBoard managerKey={managerKey} />
    </Suspense>
  );
}
