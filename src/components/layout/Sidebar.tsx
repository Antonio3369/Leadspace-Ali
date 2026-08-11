"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";
import {
  BUSINESS_LINES,
  N7_BASE,
  XLH_BASE,
  XLV_BASE,
  currentBusinessLine,
  isN7Path,
  isXlvPath,
  n7Path,
  xlhPath,
  xlvPath,
} from "@/lib/business-lines";
import { markSidebarNavTop } from "@/lib/mainScroll";
import type { UserRole } from "@/generated/prisma/client";
import { sessionAuthRealm } from "@/lib/auth-realm";

interface SidebarProps {
  user: {
    name: string;
    role: UserRole;
    authRealm?: string;
  };
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
  { href: n7Path(), label: "今日待办", icon: "📋" },
  { href: n7Path("/follow-up"), label: "达标跟进", icon: "🔔" },
  { href: n7Path("/board"), label: "数据看板", icon: "📊" },
  { href: n7Path("/daily"), label: "每日绩效", icon: "📈" },
  { href: n7Path("/admin/import"), label: "数据导入", icon: "⬆️" },
];

const N7_MANAGER_NAV_ITEMS = [
  { href: n7Path(), label: "今日待办", icon: "📋" },
  { href: n7Path("/follow-up"), label: "达标跟进", icon: "🔔" },
  { href: n7Path("/board"), label: "团队看板", icon: "📊" },
  { href: n7Path("/daily"), label: "每日绩效", icon: "📈" },
  { href: n7Path("/notifications"), label: "队员已处理", icon: "✉️" },
  { href: n7Path("/me"), label: "我的", icon: "👤" },
];

const N7_SALES_NAV_ITEMS = [
  { href: n7Path(), label: "今日待办", icon: "📋" },
  { href: n7Path("/follow-up"), label: "达标跟进", icon: "🔔" },
  { href: n7Path("/board"), label: "我的设备", icon: "📊" },
  { href: n7Path("/daily"), label: "每日绩效", icon: "📈" },
  { href: n7Path("/notifications"), label: "经理反馈", icon: "✉️" },
  { href: n7Path("/me"), label: "我的", icon: "👤" },
];

const XLV_NAV_ITEMS = [
  { href: xlvPath(), label: "今日待办", icon: "📋" },
  { href: xlvPath("/alerts"), label: "设备", icon: "📱" },
  { href: xlvPath("/board"), label: "团队看板", icon: "📊" },
  { href: xlvPath("/daily"), label: "回访情况", icon: "📈" },
];

const XLV_MANAGER_NAV_ITEMS = [
  ...XLV_NAV_ITEMS,
  { href: xlvPath("/me/team"), label: "队员管理", icon: "👥" },
  { href: xlvPath("/notifications"), label: "队员已处理", icon: "✉️" },
  { href: xlvPath("/me"), label: "我的", icon: "👤" },
];

const XLV_SALES_NAV_ITEMS = [
  { href: xlvPath(), label: "今日待办", icon: "📋" },
  { href: xlvPath("/alerts"), label: "设备", icon: "📱" },
  { href: xlvPath("/board"), label: "设备看板", icon: "📊" },
  { href: xlvPath("/daily"), label: "回访情况", icon: "📈" },
  { href: xlvPath("/notifications"), label: "经理反馈", icon: "✉️" },
  { href: xlvPath("/me"), label: "我的", icon: "👤" },
];

const XLV_DIRECTOR_NAV_ITEMS = [
  ...XLV_NAV_ITEMS,
  { href: xlvPath("/notifications"), label: "队员已处理", icon: "✉️" },
  { href: xlvPath("/admin/import"), label: "数据导入", icon: "⬆️" },
  { href: xlvPath("/admin/attribution"), label: "人员归属", icon: "🔗" },
  { href: xlvPath("/admin/accounts"), label: "经理账号", icon: "🔑" },
];

function isActivePath(pathname: string, href: string) {
  if (href === XLH_BASE) return pathname === href;
  if (href === N7_BASE) {
    return pathname === N7_BASE;
  }
  if (href === XLV_BASE) {
    if (pathname === XLV_BASE) return true;
    if (pathname.startsWith(`${XLV_BASE}/follow-up`)) return true;
    if (pathname === xlvPath("/today")) return true;
    return false;
  }
  if (href === xlvPath("/alerts")) {
    return pathname === xlvPath("/alerts");
  }
  if (href === xlvPath("/board")) {
    if (pathname === xlvPath("/board")) return true;
    if (pathname.startsWith(`${XLV_BASE}/managers/`)) return true;
    return false;
  }
  if (href === xlvPath("/me")) {
    return pathname === xlvPath("/me") || pathname.startsWith(`${XLV_BASE}/me/`);
  }
  if (href === n7Path("/board")) {
    if (pathname === n7Path("/board")) return true;
    // 看板下钻到经理/队员时仍高亮「数据看板/团队看板」
    if (pathname.startsWith(`${N7_BASE}/managers/`)) return true;
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
  const inXlv = isXlvPath(pathname);

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
    !inN7 && !inXlv && (user.role === "DIRECTOR" || user.role === "MANAGER");

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
            {user.role === "MANAGER"
              ? "经理"
              : user.role === "SALES"
                ? "队员"
                : ROLE_LABELS[user.role]}
          </p>
        </div>
        <Link
          href={sessionAuthRealm(user) === "xlv" ? "/" : "/alipay"}
          onClick={() => handleNavClick(sessionAuthRealm(user) === "xlv" ? "/" : "/alipay")}
          className="block text-xs font-medium text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
        >
          ← {sessionAuthRealm(user) === "xlv" ? "切换平台" : "切换业务"}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {inXlv ? (
          (user.role === "DIRECTOR"
            ? XLV_DIRECTOR_NAV_ITEMS
            : user.role === "SALES"
              ? XLV_SALES_NAV_ITEMS
              : XLV_MANAGER_NAV_ITEMS
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
        ) : inN7 ? (
          (user.role === "DIRECTOR"
            ? N7_DIRECTOR_NAV_ITEMS
            : user.role === "MANAGER"
              ? N7_MANAGER_NAV_ITEMS
              : user.role === "SALES"
                ? N7_SALES_NAV_ITEMS
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

        {/* N7 经理/队员改密进「我的」；其余角色侧栏保留 */}
        {!(
          (inN7 || inXlv) &&
          (user.role === "MANAGER" || user.role === "SALES")
        ) && (
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
        )}
      </nav>
    </aside>
  );
}
