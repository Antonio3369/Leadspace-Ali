import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { PageShell } from "@/components/ui/notion";
import { XlvFollowUpView } from "@/components/xlv/XlvFollowUpView";

export default async function XlvFollowUpPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessXlvWorkspace(user)) redirect("/");

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <XlvFollowUpView role={user.role} />
    </Suspense>
  );
}
