import Link from "next/link";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { NotionPanel, PageShell } from "@/components/ui/notion";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/generated/prisma/client";

export function MePanel({
  user,
  teamHref,
}: {
  user: { name: string; username: string; role: UserRole };
  teamHref?: string;
}) {
  const roleLabel =
    user.role === "MANAGER"
      ? "经理"
      : user.role === "SALES"
        ? "队员"
        : ROLE_LABELS[user.role];

  return (
    <PageShell>
      <NotionPanel padding={false} className="overflow-hidden max-w-md">
        <div className="px-4 py-3.5 border-b border-[#f1f5f9]">
          <p className="text-lg font-medium text-[#111827]">{user.name}</p>
          <p className="text-xs text-[#94a3b8] mt-0.5">{roleLabel}</p>
        </div>
        <div className="px-4 py-3.5 border-b border-[#f1f5f9]">
          <p className="text-xs text-[#94a3b8] mb-2">登录名</p>
          <p className="text-sm text-[#111827] font-medium">{user.username}</p>
        </div>
        <Link
          href="/settings/password"
          className="flex items-center justify-between px-4 py-3.5 text-sm text-[#111827] active:bg-[#f8fafc] border-b border-[#f1f5f9]"
        >
          <span>修改密码</span>
          <span className="text-[#94a3b8]">›</span>
        </Link>
        {teamHref && (
          <Link
            href={teamHref}
            className="flex items-center justify-between px-4 py-3.5 text-sm text-[#111827] active:bg-[#f8fafc] border-b border-[#f1f5f9]"
          >
            <span>人员管理</span>
            <span className="text-[#94a3b8]">›</span>
          </Link>
        )}
        <Link
          href="/"
          className="flex items-center justify-between px-4 py-3.5 text-sm text-[#111827] active:bg-[#f8fafc]"
        >
          <span>切换业务</span>
          <span className="text-[#94a3b8]">›</span>
        </Link>
      </NotionPanel>

      <div className="max-w-md">
        <SignOutButton className="w-full rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-sm text-[#64748b] hover:text-[#111827] active:bg-[#f8fafc]" />
      </div>
    </PageShell>
  );
}
