import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessN7Workspace } from "@/services/n7/n7-scope";
import { PageShell } from "@/components/ui/notion";
import { N7FollowUpView } from "@/components/n7/N7FollowUpView";

export default async function N7FollowUpPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessN7Workspace(user)) redirect("/");

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <N7FollowUpView
        forcedManagerKey={user.role === "MANAGER" ? user.id : null}
      />
    </Suspense>
  );
}
