"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";
import {
  BUSINESS_LINES,
  N7_BASE,
  XLH_BASE,
  currentBusinessLine,
  isN7Path,
  n7Path,
  xlhPath,
} from "@/lib/business-lines";
import { markSidebarNavTop } from "@/lib/mainScroll";
import type { UserRole } from "@/generated/prisma/client";

interface SidebarProps {
  user: { name: string; role: UserRole };
  open: boolean;
  onNavigate?: () => void;
}

const XLH_NAV_ITEMS = [
  { href: XLH_BASE, label: "数据总览", icon: "📊" },
  { href: xlhPath("/teams"), label: "团队明细", icon: "👥" },
  { href: xlhPath("/opportunities"), label: "商机分析", icon: "💼" },
  { href: xlhPath("/ledger"), label: "风控台账", icon: "📋" },
];

const N7_DIRECTOR_NAV_ITEMS = [
  { href: n7Path(), label: "数据看板", icon: "📊" },
  { href: n7Path("/daily"), label: "每日绩效", icon: "📈" },
  { href: n7Path("/follow-up"), label: "待跟进", icon: "🔔" },
  { href: n7Path("/admin/import"), label: "数据导入", icon: "⬆️" },
];

const N7_MANAGER_NAV_ITEMS = [
  { href: n7Path(), label: "团队看板", icon: "📊" },
  { href: n7Path("/daily"), label: "每日绩效", icon: "📈" },
  { href: n7Path("/follow-up"), label: "待跟进", icon: "🔔" },
];

function isActivePath(pathname: string, href: string) {
  if (href === XLH_BASE) return pathname === href;
  if (href === N7_BASE) {
    // 看板下钻到经理/队员/设备时，仍高亮「数据看板/团队看板」
    if (pathname === N7_BASE) return true;
    if (pathname.startsWith(`${N7_BASE}/managers/`)) return true;
    if (pathname.startsWith(`${N7_BASE}/devices/`)) return true;
    return false;
  }
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
  const lineId = currentBusinessLine(pathname);
  const line = lineId ? BUSINESS_LINES[lineId] : null;
  const inN7 = isN7Path(pathname);

  function handleNavClick(href: string) {
    try {
      const path = new URL(href, window.location.origin).pathname;
      markSidebarNavTop(path);
    } catch {
      markSidebarNavTop(href.split("?")[0] || href);
    }
    onNavigate?.();
  }

  const adminHref =
    user.role === "MANAGER" ? xlhPath("/admin/team") : xlhPath("/admin/org");
  const adminLabel = user.role === "MANAGER" ? "团队管理" : "组织管理";
  const showAdminNav =
    !inN7 && (user.role === "DIRECTOR" || user.role === "MANAGER");

  return (
    <aside
      className={`fixed md:static inset-y-0 left-0 z-[100] w-[220px] h-full shrink-0 flex flex-col bg-[#fbfbfa] border-r border-[rgba(55,53,47,0.09)] transition-transform duration-200 md:translate-x-0 ${
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
          <p className="text-[0.72rem] text-[#94a3b8] truncate">
            {line?.name ?? "数据工作台"}
          </p>
        </div>
      </div>

      <div className="px-3 py-2.5 border-b border-[rgba(55,53,47,0.06)] space-y-2">
        <div>
          <p className="text-sm font-medium text-[#111827] truncate">{user.name}</p>
          <p className="text-xs text-[#94a3b8]">
            {user.role === "MANAGER" ? "经理" : ROLE_LABELS[user.role]}
          </p>
        </div>
        <Link
          href="/"
          onClick={() => handleNavClick("/")}
          className="block text-xs font-medium text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
        >
          ← 切换业务
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {inN7 ? (
          (user.role === "DIRECTOR"
            ? N7_DIRECTOR_NAV_ITEMS
            : user.role === "MANAGER"
              ? N7_MANAGER_NAV_ITEMS
              : [{ href: n7Path(), label: "业务首页", icon: "📊" }]
          ).map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.href)}
                className={navLinkClass(active)}
              >
                <span className="w-5 text-center text-sm opacity-80">{item.icon}</span>
                {item.label}
              </Link>
            );
          })
        ) : (
          <>
            {XLH_NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => handleNavClick(item.href)}
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
                onClick={() => handleNavClick(adminHref)}
                className={navLinkClass(isActivePath(pathname, adminHref))}
              >
                <span className="w-5 text-center text-sm opacity-80">⚙️</span>
                {adminLabel}
              </Link>
            )}

            {user.role === "DIRECTOR" && (
              <>
                <Link
                  href={xlhPath("/admin/import")}
                  onClick={() => handleNavClick(xlhPath("/admin/import"))}
                  className={navLinkClass(isActivePath(pathname, xlhPath("/admin/import")))}
                >
                  <span className="w-5 text-center text-sm opacity-80">⬆️</span>
                  数据上传
                </Link>
                <Link
                  href={xlhPath("/screen")}
                  onClick={() => handleNavClick(xlhPath("/screen"))}
                  className={navLinkClass(isActivePath(pathname, xlhPath("/screen")))}
                >
                  <span className="w-5 text-center text-sm opacity-80">🖥</span>
                  公共大屏
                </Link>
              </>
            )}
          </>
        )}

        <div className="pt-2 mt-2 border-t border-[rgba(55,53,47,0.06)]">
          <Link
            href="/settings/password"
            onClick={() => handleNavClick("/settings/password")}
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
