"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getMainScrollEl, scrollMainToTop } from "@/lib/mainScroll";

const SHOW_AFTER_PX = 280;

/**
 * 手机长列表回顶：监听 #app-scroll（与 AppShell 一致），无该容器时回退 window。
 */
export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);

    const el = getMainScrollEl();
    const readTop = () => (el ? el.scrollTop : window.scrollY || 0);
    const onScroll = () => setVisible(readTop() > SHOW_AFTER_PX);

    onScroll();

    if (el) {
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => el.removeEventListener("scroll", onScroll);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  function handleClick() {
    const el = getMainScrollEl();
    if (el) {
      el.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    scrollMainToTop();
  }

  return (
    <button
      type="button"
      aria-label="返回顶部"
      onClick={handleClick}
      className={`fixed z-[80] right-4 md:right-6 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] md:bottom-6 flex h-11 w-11 items-center justify-center rounded-full border border-[#e2e8f0] bg-white/95 text-[#334155] shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-all duration-200 hover:border-[#cbd5e1] hover:text-[#0f172a] active:scale-95 ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M12 5v14M5 12l7-7 7 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
