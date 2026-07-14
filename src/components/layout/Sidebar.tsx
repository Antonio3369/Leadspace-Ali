"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/generated/prisma/client";

interface SidebarProps {
  user: { name: string; role: UserRole };
  open: boolean;
  onNavigate?: () => void;
}

const NAV_ITEMS = [
  { href: "/", label: "数据总览", icon: "📊" },
  { href: "/teams", label: "团队明细", icon: "👥" },
  { href: "/opportunities", label: "商机分析", icon: "💼" },
  { href: "/ledger", label: "风控台账", icon: "📋" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClass(active: boolean) {
  return `flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[0.9rem] transition-colors ${
    active
      ? "bg-[rgba(55,53,47,0.08)] text-[#111827] font-semibold"
      : "text-[rgba(55,53,47,0.78)] hover:bg-[rgba(55,53,47,0.06)] hover:text-[#111827]"
  }`;
}

export function Sidebar({ user, open, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  function handleClick() {
    onNavigate?.();
  }

  const adminHref = user.role === "MANAGER" ? "/admin/team" : "/admin/org";
  const adminLabel = user.role === "MANAGER" ? "团队管理" : "组织管理";
  const showAdminNav = user.role === "DIRECTOR" || user.role === "MANAGER";

  return (
    <aside
      className={`fixed md:static inset-y-0 left-0 z-[100] w-[220px] shrink-0 flex flex-col bg-[#fbfbfa] border-r border-[rgba(55,53,47,0.09)] transition-transform duration-200 md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2.5 px-3 py-4 border-b border-[rgba(55,53,47,0.06)]">
        <div className="w-8 h-8 rounded-lg bg-[#eff6ff] text-[#2563eb] grid place-items-center text-sm font-bold shrink-0">
          L
        </div>
        <div className="min-w-0">
          <p className="text-[0.92rem] font-bold text-[#111827] leading-tight truncate">
            Leadspace.Alipay
          </p>
          <p className="text-[0.72rem] text-[#94a3b8] truncate">数据工作台</p>
        </div>
      </div>

      <div className="px-3 py-2.5 border-b border-[rgba(55,53,47,0.06)]">
        <p className="text-sm font-medium text-[#111827] truncate">{user.name}</p>
        <p className="text-xs text-[#94a3b8]">
          {user.role === "MANAGER" ? "经理" : ROLE_LABELS[user.role]}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleClick}
              className={navLinkClass(active)}
            >
              <span className="w-5 text-center text-sm opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {showAdminNav && (
          <Link
            href={adminHref}
            onClick={handleClick}
            className={navLinkClass(isActivePath(pathname, adminHref))}
          >
            <span className="w-5 text-center text-sm opacity-80">⚙️</span>
            {adminLabel}
          </Link>
        )}

        {user.role === "DIRECTOR" && (
          <>
            <Link
              href="/admin/import"
              onClick={handleClick}
              className={navLinkClass(isActivePath(pathname, "/admin/import"))}
            >
              <span className="w-5 text-center text-sm opacity-80">⬆️</span>
              数据上传
            </Link>
            <Link
              href="/screen"
              onClick={handleClick}
              className={navLinkClass(isActivePath(pathname, "/screen"))}
            >
              <span className="w-5 text-center text-sm opacity-80">🖥</span>
              公共大屏
            </Link>
          </>
        )}

        <div className="pt-2 mt-2 border-t border-[rgba(55,53,47,0.06)]">
          <Link
            href="/settings/password"
            onClick={handleClick}
            className={navLinkClass(isActivePath(pathname, "/settings/password"))}
          >
            <span className="w-5 text-center text-sm opacity-80">🔒</span>
            修改密码
          </Link>
        </div>
      </nav>
    </aside>
  );
}
