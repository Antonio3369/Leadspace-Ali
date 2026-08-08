"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isXlvPath } from "@/lib/business-lines";
import { prefetchXlvApi } from "@/lib/xlv-api-cache";

/** 在小绿盒工作区内预取另一 Tab 的 API；全量看板延后加载，避免并发 OOM */
export function XlvWorkspacePrefetch() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isXlvPath(pathname)) return;

    const isAlerts = pathname.endsWith("/alerts");
    const peerTab = isAlerts ? `/api/xlv/today` : `/api/xlv/dashboard?alert=sleep`;

    const peerTimer = window.setTimeout(() => prefetchXlvApi(peerTab), 300);

    const fullTimer = window.setTimeout(() => {
      prefetchXlvApi(`/api/xlv/dashboard`);
    }, 15_000);

    return () => {
      window.clearTimeout(peerTimer);
      window.clearTimeout(fullTimer);
    };
  }, [pathname]);

  return null;
}
