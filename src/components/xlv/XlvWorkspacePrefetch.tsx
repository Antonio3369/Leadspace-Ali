"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { isXlvPath } from "@/lib/business-lines";
import { hasXlvApiInFlightPrefix, prefetchXlvApi } from "@/lib/xlv-api-cache";

/** 空闲时仅预取团队看板，不叠加 summary/对端 Tab，避免与首屏重接口并发 */
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
    if (pathname.endsWith("/board") || !boardUrl) return;

    const timer = window.setTimeout(() => {
      if (
        hasXlvApiInFlightPrefix("/api/xlv/today") ||
        hasXlvApiInFlightPrefix("/api/xlv/dashboard/devices")
      ) {
        return;
      }
      prefetchXlvApi(boardUrl);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [pathname, boardUrl]);

  return null;
}
