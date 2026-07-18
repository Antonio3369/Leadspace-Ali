import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessBusinessLine } from "@/lib/business-lines";
import {
  canAccessN7Workspace,
  canViewN7,
} from "@/services/n7/n7-scope";
import { PageHeader, PageShell } from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import { N7ManagerBoard } from "@/components/n7/N7ManagerBoard";
import { N7StaffBoard } from "@/components/n7/N7StaffBoard";

export default async function N7HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (canViewN7(user.role) && !canAccessBusinessLine(user.role, user.businessLines, "n7")) {
    redirect("/");
  }

  if (!canAccessN7Workspace(user)) {
    return (
      <PageShell>
        <PageHeader
          title="支付宝 N7"
          kicker="业务工作台"
          meta={<p>当前角色暂未开放 N7 看板。</p>}
        />
        <div className="rounded-[14px] border border-[#eef2f7] bg-white p-8 text-center space-y-4 shadow-sm">
          <p className="text-[#64748b] text-sm leading-relaxed max-w-md mx-auto">
            队员端将在后续开放。请使用管理员或经理账号进入。
          </p>
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
