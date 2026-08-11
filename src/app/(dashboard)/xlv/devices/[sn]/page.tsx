import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { xlvPath } from "@/lib/business-lines";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { canSubmitXlvFollowUpReview } from "@/services/xlv/follow-up-review";
import { PageShell } from "@/components/ui/notion";
import { XlvDeviceDetailView } from "@/components/xlv/XlvDeviceDetailView";
import { safeDecodeURIComponent } from "@/lib/fetch-json";

export default async function XlvDeviceDetailPage({
  params,
}: {
  params: Promise<{ sn: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user)) redirect("/");

  const { sn } = await params;

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <XlvDeviceDetailView
        sn={safeDecodeURIComponent(sn)}
        canReviewFollowUp={canSubmitXlvFollowUpReview(user)}
      />
    </Suspense>
  );
}
