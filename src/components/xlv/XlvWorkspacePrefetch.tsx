"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isXlvPath } from "@/lib/business-lines";
import { prefetchXlvApi } from "@/lib/xlv-api-cache";

/** 在小绿盒工作区内预取另一 Tab + 看板首屏，全量列表按需加载 */
export function XlvWorkspacePrefetch() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isXlvPath(pathname)) return;

    const isAlerts = pathname.endsWith("/alerts");
    const peerTab = isAlerts ? `/api/xlv/today` : `/api/xlv/dashboard/devices?alert=sleep`;

    const summaryTimer = window.setTimeout(() => {
      prefetchXlvApi(`/api/xlv/dashboard/summary`);
    }, 300);

    const peerTimer = window.setTimeout(() => prefetchXlvApi(peerTab), 800);

    return () => {
      window.clearTimeout(summaryTimer);
      window.clearTimeout(peerTimer);
    };
  }, [pathname]);

  return null;
}
