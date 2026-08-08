"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isXlvPath } from "@/lib/business-lines";
import { prefetchXlvApi } from "@/lib/xlv-api-cache";

/** 在小绿盒工作区内预取主要 Tab 的 API，切换底栏时更快 */
export function XlvWorkspacePrefetch() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isXlvPath(pathname)) return;

    const urls = [
      `/api/xlv/today`,
      `/api/xlv/dashboard?alert=sleep`,
      `/api/xlv/dashboard`,
    ];

    const timer = window.setTimeout(() => {
      for (const url of urls) prefetchXlvApi(url);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
