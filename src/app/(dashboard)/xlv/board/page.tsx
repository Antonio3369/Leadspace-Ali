import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessBusinessLine, xlvPath } from "@/lib/business-lines";
import {
  canAccessXlvWorkspace,
  canViewXlv,
} from "@/services/xlv/xlv-scope";
import { PageHeader, PageShell } from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import { XlvManagerBoard } from "@/components/xlv/XlvManagerBoard";
import { XlvStaffBoard } from "@/components/xlv/XlvStaffBoard";

export default async function XlvBoardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (canViewXlv(user.role) && !canAccessBusinessLine(user.role, user.businessLines, "xlv")) {
    redirect("/");
  }

  if (!canAccessXlvWorkspace(user)) {
    return (
      <PageShell>
        <PageHeader title="团队看板" kicker="微信小绿盒" meta={<p>当前角色暂未开放。</p>} />
        <HistoryBackLink
          label="← 返回"
          fallbackHref={xlvPath()}
          preferHistoryBack
          className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
        />
      </PageShell>
    );
  }

  if (user.role === "SALES") {
    const live = await db.user.findUnique({
      where: { id: user.id },
      select: { managerId: true },
    });
    let managerKey = live?.managerId ?? null;
    if (!managerKey) {
      const sample = await db.xlvDeviceRecord.findFirst({
        where: { OR: [{ salesUserId: user.id }, { operatorName: user.name }] },
        select: { managerUserId: true, managerName: true },
        orderBy: { updatedAt: "desc" },
      });
      managerKey =
        sample?.managerUserId ??
        (sample?.managerName ? `name:${sample.managerName}` : null);
    }
    if (!managerKey) {
      redirect(xlvPath());
    }
    redirect(
      xlvPath(
        `/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(user.id)}`
      )
    );
  }

  if (user.role === "MANAGER") {
    return (
      <Suspense
        fallback={
          <PageShell>
            <p className="text-sm text-[#94a3b8]">加载中…</p>
          </PageShell>
        }
      >
        <XlvStaffBoard managerKey={user.id} variant="home" />
      </Suspense>
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
      <XlvManagerBoard />
    </Suspense>
  );
}
