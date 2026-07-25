import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessBusinessLine, n7Path } from "@/lib/business-lines";
import {
  canAccessN7Workspace,
  canViewN7,
} from "@/services/n7/n7-scope";
import { PageHeader, PageShell } from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import { N7ManagerBoard } from "@/components/n7/N7ManagerBoard";
import { N7StaffBoard } from "@/components/n7/N7StaffBoard";

export default async function N7BoardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (canViewN7(user.role) && !canAccessBusinessLine(user.role, user.businessLines, "n7")) {
    redirect("/");
  }

  if (!canAccessN7Workspace(user)) {
    return (
      <PageShell>
        <PageHeader
          title="数据看板"
          kicker="支付宝 N7"
          meta={<p>当前角色暂未开放。</p>}
        />
        <HistoryBackLink
          label="← 返回"
          fallbackHref="/n7"
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
    // 未绑 managerId 时，勿用业务员自己的姓名冒充经理 key（会把设备 AND 筛空）
    if (!managerKey) {
      const sample = await db.n7DeviceRecord.findFirst({
        where: { OR: [{ salesUserId: user.id }, { operatorName: user.name }] },
        select: { managerUserId: true, managerName: true },
        orderBy: { registeredAt: "desc" },
      });
      managerKey =
        sample?.managerUserId ??
        (sample?.managerName ? `name:${sample.managerName}` : null);
    }
    if (!managerKey) {
      redirect(n7Path());
    }
    redirect(
      n7Path(
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
        <N7StaffBoard managerKey={user.id} variant="home" />
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
      <N7ManagerBoard />
    </Suspense>
  );
}
