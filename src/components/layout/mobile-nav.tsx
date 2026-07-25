"use client";

import { N7_BASE, isN7Path, n7Path } from "@/lib/business-lines";
import type { UserRole } from "@/generated/prisma/client";

export type MobileTabIcon = "todo" | "follow" | "board" | "daily" | "me";

export type MobileTabItem = {
  href: string;
  label: string;
  tabLabel: string;
  icon: MobileTabIcon;
  match?: "exact" | "prefix";
  /** 角标未读数（经理「待办」） */
  badge?: number;
};

/** N7 经理 / 队员手机底栏；管理员与小蓝环不改 */
export function buildN7MobileTabs(role: UserRole, pathname: string): MobileTabItem[] | null {
  if (!isN7Path(pathname)) return null;
  if (role !== "MANAGER" && role !== "SALES") return null;

  return [
    { href: n7Path(), label: "今日待办", tabLabel: "待办", match: "exact", icon: "todo" },
    {
      href: n7Path("/follow-up"),
      label: "达标跟进",
      tabLabel: "跟进",
      match: "prefix",
      icon: "follow",
    },
    {
      href: n7Path("/board"),
      label: role === "MANAGER" ? "团队看板" : "我的设备",
      tabLabel: "看板",
      match: "prefix",
      icon: "board",
    },
    {
      href: n7Path("/daily"),
      label: "每日绩效",
      tabLabel: "绩效",
      match: "prefix",
      icon: "daily",
    },
    { href: n7Path("/me"), label: "我的", tabLabel: "我的", match: "prefix", icon: "me" },
  ];
}

export function shouldUseN7BottomTabs(role: UserRole, pathname: string) {
  return (role === "MANAGER" || role === "SALES") && isN7Path(pathname);
}

export function shouldShowBottomTabs(pathname: string) {
  if (pathname.startsWith(`${N7_BASE}/devices/`)) return false;
  if (pathname.startsWith("/settings/")) return false;
  return true;
}

export function isMobileNavActive(pathname: string, item: MobileTabItem) {
  if (item.href.endsWith("/me")) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  if (item.match === "exact") {
    return pathname === N7_BASE;
  }
  if (item.href === n7Path("/board")) {
    if (pathname === n7Path("/board")) return true;
    if (pathname.startsWith(`${N7_BASE}/managers/`)) return true;
    return false;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileTabIconView({
  name,
  active,
  badge = 0,
}: {
  name: MobileTabIcon;
  active: boolean;
  badge?: number;
}) {
  const stroke = active ? "#2563eb" : "#94a3b8";
  const common = {
    viewBox: "0 0 24 24",
    className: "h-5 w-5",
    fill: "none" as const,
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  const icon = (() => {
    switch (name) {
      case "todo":
        return (
          <svg {...common}>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        );
      case "follow":
        return (
          <svg {...common}>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        );
      case "board":
        return (
          <svg {...common}>
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
        );
      case "daily":
        return (
          <svg {...common}>
            <path d="M4 19V5" />
            <path d="M4 19h16" />
            <path d="M8 16v-5" />
            <path d="M12 16V8" />
            <path d="M16 16v-3" />
          </svg>
        );
      case "me":
        return (
          <svg {...common}>
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 19a7 7 0 0 1 14 0" />
          </svg>
        );
    }
  })();

  return (
    <span className="relative inline-flex">
      {icon}
      {badge > 0 ? (
        <span className="absolute -right-2 -top-1 min-w-[1rem] rounded-full bg-[#ef4444] px-1 text-center text-[9px] font-semibold leading-4 text-white tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </span>
  );
}
