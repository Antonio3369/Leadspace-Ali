"use client";

import { useRouter } from "next/navigation";

/** 同站来源且有历史时 back（保留滚动）；否则走 fallbackHref */
export function HistoryBackLink({
  label = "← 返回",
  fallbackHref,
  className = "inline-block text-sm text-[#64748b] hover:text-[#2563eb] transition-colors text-left",
}: {
  label?: string;
  fallbackHref?: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined") {
      let sameOriginReferrer = false;
      try {
        sameOriginReferrer = Boolean(
          document.referrer &&
            new URL(document.referrer).origin === window.location.origin
        );
      } catch {
        sameOriginReferrer = false;
      }
      // 仅同站 referrer 才 back，避免 history.length 虚高误跳外站历史
      if (sameOriginReferrer) {
        router.back();
        return;
      }
    }
    if (fallbackHref) {
      router.push(fallbackHref);
      return;
    }
    router.back();
  }

  return (
    <button type="button" onClick={goBack} className={className}>
      {label}
    </button>
  );
}
