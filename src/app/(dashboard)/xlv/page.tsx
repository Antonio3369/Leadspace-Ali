import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessBusinessLine } from "@/lib/business-lines";
import {
  canAccessXlvWorkspace,
  canViewXlv,
} from "@/services/xlv/xlv-scope";
import { PageHeader, PageShell } from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import { XlvDashboardView } from "@/components/xlv/XlvDashboardView";

export default async function XlvHomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (canViewXlv(user.role) && !canAccessBusinessLine(user.role, user.businessLines, "xlv")) {
    redirect("/");
  }

  if (!canAccessXlvWorkspace(user)) {
    return (
      <PageShell>
        <PageHeader
          title="微信小绿盒"
          kicker="业务工作台"
          meta={<p>当前账号未开通微信小绿盒，请联系管理员。</p>}
        />
        <div className="rounded-[14px] border border-[#eef2f7] bg-white p-8 text-center space-y-4 shadow-sm">
          <HistoryBackLink
            label="← 返回"
            fallbackHref="/"
            preferHistoryBack
            className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
          />
        </div>
      </PageShell>
    );
  }

  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-[#94a3b8]">加载中…</p>
        </PageShell>
      }
    >
      <XlvDashboardView role={user.role} />
    </Suspense>
  );
}
