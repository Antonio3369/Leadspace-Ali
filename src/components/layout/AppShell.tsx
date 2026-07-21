"use client";

import { Suspense, useState } from "react";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { ScrollMemory } from "@/components/layout/ScrollMemory";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  BUSINESS_LINES,
  currentBusinessLine,
  showBusinessShell,
} from "@/lib/business-lines";

interface AppShellProps {
  user: { name: string; role: UserRole };
  signOutMobile: React.ReactNode;
  signOutDesktop: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 布局对齐 hk.orblead：视口锁高 + #app-scroll 独立滚动。
 * Safari 下必须滚这个容器，而不是 window。
 */
export function AppShell({ user, signOutMobile, signOutDesktop, children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const withSidebar = showBusinessShell(pathname);
  const line = currentBusinessLine(pathname);
  const lineName = line ? BUSINESS_LINES[line].name : null;

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

        <div className="hidden md:flex shrink-0 items-center justify-end px-6 py-2 border-b border-[#eef2f7] bg-white/60">
          {signOutDesktop}
        </div>

        <main
          id="app-scroll"
          className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]"
        >
          <div className="w-full max-w-[1520px] mx-auto px-4 sm:px-5 py-5 md:py-7 min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
