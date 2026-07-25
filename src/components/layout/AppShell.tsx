"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { ScrollMemory } from "@/components/layout/ScrollMemory";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  MobileTabIconView,
  buildN7MobileTabs,
  isMobileNavActive,
  shouldShowBottomTabs,
  shouldUseN7BottomTabs,
} from "@/components/layout/mobile-nav";
import {
  BUSINESS_LINES,
  currentBusinessLine,
  isN7Path,
  showBusinessShell,
} from "@/lib/business-lines";
import { markSidebarNavTop } from "@/lib/mainScroll";
import { N7_NOTIFICATIONS_CHANGED } from "@/lib/n7-notifications-client";

interface AppShellProps {
  user: { name: string; role: UserRole };
  signOutMobile: React.ReactNode;
  signOutDesktop: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 视口锁高 + #app-scroll。
 * N7 经理/队员手机：底栏；管理员与小蓝环保持汉堡侧栏。
 */
export function AppShell({ user, signOutMobile, signOutDesktop, children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const withSidebar = showBusinessShell(pathname);
  const line = currentBusinessLine(pathname);
  const lineName = line ? BUSINESS_LINES[line].name : null;

  const mobileTabs = buildN7MobileTabs(user.role, pathname)?.map((item) =>
    item.icon === "todo" && user.role === "MANAGER" && notifUnread > 0
      ? { ...item, badge: notifUnread }
      : item
  );
  const useBottomTabs = shouldUseN7BottomTabs(user.role, pathname);
  const showBottomTabs =
    useBottomTabs && shouldShowBottomTabs(pathname) && Boolean(mobileTabs);

  useEffect(() => {
    if (showBottomTabs) {
      document.documentElement.dataset.bottomTabs = "1";
    } else {
      delete document.documentElement.dataset.bottomTabs;
    }
    return () => {
      delete document.documentElement.dataset.bottomTabs;
    };
  }, [showBottomTabs]);

  useEffect(() => {
    if (user.role !== "MANAGER" || !isN7Path(pathname)) {
      setNotifUnread(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetch("/api/n7/notifications?countOnly=1")
        .then(async (res) => {
          if (!res.ok) return;
          const json = await res.json();
          if (!cancelled) setNotifUnread(Number(json.unread) || 0);
        })
        .catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 60_000);
    window.addEventListener(N7_NOTIFICATIONS_CHANGED, load);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener(N7_NOTIFICATIONS_CHANGED, load);
    };
  }, [user.role, pathname]);

  const scrollMemory = (
    <Suspense fallback={null}>
      <ScrollMemory />
    </Suspense>
  );

  if (!withSidebar) {
    return (
      <div className="h-full min-h-0 flex-1 flex flex-col overflow-hidden bg-[#f4f6f9]">
        {scrollMemory}
        <header className="shrink-0 z-50 bg-white/92 backdrop-blur-md border-b border-[#eef2f7]">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 max-w-[1520px] mx-auto w-full">
            <span className="text-sm font-semibold text-[#111827] truncate">Leadspace.Alipay</span>
            {signOutDesktop}
          </div>
        </header>
        <main
          id="app-scroll"
          className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]"
        >
          <div className="w-full max-w-[1520px] mx-auto px-4 sm:px-5 py-6 md:py-7 min-w-0">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex-1 flex overflow-hidden bg-[#f4f6f9]">
      {scrollMemory}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="关闭菜单"
          className="fixed inset-0 z-[90] bg-[#0f172a]/28 md:hidden border-none cursor-pointer"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar user={user} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {useBottomTabs ? (
          <div className="md:hidden shrink-0 h-[env(safe-area-inset-top,0px)] bg-[#f4f6f9]" />
        ) : (
          <header className="shrink-0 z-50 bg-white/92 backdrop-blur-md border-b border-[#eef2f7] md:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                aria-label="打开菜单"
                className="w-11 h-11 flex flex-col items-center justify-center gap-1 border border-[#e2e8f0] rounded-[10px] bg-white"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="block w-4 h-0.5 bg-[#64748b] rounded-full" />
                <span className="block w-4 h-0.5 bg-[#64748b] rounded-full" />
                <span className="block w-4 h-0.5 bg-[#64748b] rounded-full" />
              </button>
              <div className="min-w-0 text-center">
                <p className="text-sm font-semibold text-[#111827] truncate">
                  {lineName ?? "Leadspace.Alipay"}
                </p>
                {lineName && (
                  <p className="text-[0.68rem] text-[#94a3b8] truncate">Leadspace.Alipay</p>
                )}
              </div>
              {signOutMobile}
            </div>
          </header>
        )}

        <div className="hidden md:flex shrink-0 items-center justify-end px-6 py-2 border-b border-[#eef2f7] bg-white/60">
          {signOutDesktop}
        </div>

        <main
          id="app-scroll"
          className={`flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] ${
            showBottomTabs
              ? "pb-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.75rem))]"
              : ""
          }`}
        >
          <div className="w-full max-w-[1520px] mx-auto px-4 sm:px-5 py-5 md:py-7 min-w-0">
            {children}
          </div>
        </main>

        {showBottomTabs && mobileTabs ? (
          <nav
            className="md:hidden shrink-0 border-t border-[#eef2f7] bg-white/95 backdrop-blur-sm px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))]"
            aria-label="主导航"
          >
            <div className="grid grid-cols-5 items-end">
              {mobileTabs.map((item) => {
                const active = isMobileNavActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => markSidebarNavTop(item.href)}
                    className="flex flex-col items-center justify-center gap-0.5 min-h-[48px] py-1 active:opacity-70"
                  >
                    <MobileTabIconView
                      name={item.icon}
                      active={active}
                      badge={item.badge ?? 0}
                    />
                    <span
                      className={`text-[10px] leading-none ${
                        active ? "text-[#2563eb] font-medium" : "text-[#94a3b8]"
                      }`}
                    >
                      {item.tabLabel}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
