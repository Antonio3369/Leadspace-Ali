"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { isXlvPath } from "@/lib/business-lines";
import { prefetchXlvApisSequential } from "@/lib/xlv-api-cache";

/** 在小绿盒工作区内串行预取 Tab 对端 + 团队看板，避免切换时并发打爆服务端 */
export function XlvWorkspacePrefetch({
  role,
  managerKey,
}: {
  role: string;
  managerKey?: string | null;
}) {
  const pathname = usePathname();

  const boardUrl = useMemo(() => {
    if (role === "DIRECTOR" || role === "ADMIN") return "/api/xlv/board?";
    if (role === "MANAGER" && managerKey) {
      return `/api/xlv/managers/${encodeURIComponent(managerKey)}/staff`;
    }
    return null;
  }, [role, managerKey]);

  useEffect(() => {
    if (!isXlvPath(pathname)) return;
    if (pathname.endsWith("/board")) return;

    const isAlerts = pathname.endsWith("/alerts");
    const peerTab = isAlerts
      ? `/api/xlv/today`
      : `/api/xlv/dashboard/devices?alert=sleep`;

    const urls = [`/api/xlv/dashboard/summary`];
    if (boardUrl) urls.push(boardUrl);
    urls.push(peerTab);

    const timer = window.setTimeout(() => {
      prefetchXlvApisSequential(urls);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [pathname, boardUrl]);

  return null;
}
