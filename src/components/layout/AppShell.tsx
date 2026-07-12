"use client";

import { useState } from "react";
import type { UserRole } from "@/generated/prisma/client";
import { Sidebar } from "@/components/layout/Sidebar";

interface AppShellProps {
  user: { name: string; role: UserRole };
  signOutMobile: React.ReactNode;
  signOutDesktop: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ user, signOutMobile, signOutDesktop, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-[#f4f6f9]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="关闭菜单"
          className="fixed inset-0 z-[90] bg-[#0f172a]/28 md:hidden border-none cursor-pointer"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar user={user} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-50 bg-white/92 backdrop-blur-md border-b border-[#eef2f7] md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              aria-label="打开菜单"
              className="w-10 h-10 flex flex-col items-center justify-center gap-1 border border-[#e2e8f0] rounded-[10px] bg-white"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="block w-4 h-0.5 bg-[#64748b] rounded-full" />
              <span className="block w-4 h-0.5 bg-[#64748b] rounded-full" />
              <span className="block w-4 h-0.5 bg-[#64748b] rounded-full" />
            </button>
            <span className="text-sm font-semibold text-[#111827] truncate">Leadspace.Alipay</span>
            {signOutMobile}
          </div>
        </header>

        <div className="hidden md:flex items-center justify-end px-6 py-2 border-b border-[#eef2f7] bg-white/60">
          {signOutDesktop}
        </div>

        <main className="flex-1 w-full max-w-[1520px] mx-auto px-4 sm:px-5 py-6 md:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
