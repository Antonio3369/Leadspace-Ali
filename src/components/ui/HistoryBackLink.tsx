"use client";

import { useRouter } from "next/navigation";
import {
  markListRestore,
  markRestoreAfterBack,
  readLastListKey,
  restoreListScroll,
} from "@/lib/mainScroll";

/**
 * 返回上一页并恢复列表滚动。
 * 有站内来源时一律 history.back（避免设备详情被 fallback 错送回 /n7）。
 * 无历史时再走 fallbackHref。
 */
export function HistoryBackLink({
  label = "← 返回",
  fallbackHref,
  className = "inline-block text-sm text-[#64748b] hover:text-[#2563eb] transition-colors text-left",
  listScrollKey,
  /** 强制先 history.back（设备详情等） */
  preferHistoryBack = false,
}: {
  label?: string;
  fallbackHref?: string;
  className?: string;
  listScrollKey?: string;
  preferHistoryBack?: boolean;
}) {
  const router = useRouter();

  function fallbackPath() {
    if (!fallbackHref) return "";
    try {
      return new URL(fallbackHref, window.location.origin).pathname;
    } catch {
      return fallbackHref.split("?")[0] || "";
    }
  }

  function goBack() {
    const lastKey = readLastListKey();
    const key = listScrollKey || lastKey || fallbackPath();
    const useHistoryBack = preferHistoryBack || Boolean(lastKey);

    if (useHistoryBack && typeof window !== "undefined") {
      // 落地页用自己的 pathname 恢复，不依赖可能过期的 lastKey
      markRestoreAfterBack();
      if (key) markListRestore(key);
      const start = `${window.location.pathname}${window.location.search}`;
      window.history.back();

      if (fallbackHref) {
        window.setTimeout(() => {
          if (`${window.location.pathname}${window.location.search}` === start) {
            router.replace(fallbackHref, { scroll: false });
            if (key) {
              markListRestore(key);
              requestAnimationFrame(() => restoreListScroll(key));
            }
          }
        }, 300);
      }
      return;
    }

    if (key) markListRestore(key);

    if (fallbackHref) {
      router.replace(fallbackHref, { scroll: false });
      if (key) {
        requestAnimationFrame(() => restoreListScroll(key));
      }
      return;
    }

    if (typeof window !== "undefined") {
      window.history.back();
      if (key) {
        requestAnimationFrame(() => restoreListScroll(key));
      }
    }
  }

  return (
    <button type="button" onClick={goBack} className={className}>
      {label}
    </button>
  );
}
