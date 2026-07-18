"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  captureListScroll,
  consumeSidebarNavTop,
  getMainScrollEl,
  getMainScrollTop,
  scrollMainToTop,
  writeListScroll,
} from "@/lib/mainScroll";

function hasPendingRestore(pathname: string) {
  try {
    return sessionStorage.getItem(`leadspace:restore:${pathname}`) === "1";
  } catch {
    return false;
  }
}

/**
 * 监听 #app-scroll；进入详情前写入列表滚动。
 * 侧栏导航强制回顶；返回列表时恢复滚动。
 */
export function ScrollMemory() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;

    // 侧栏点击：无论是否同 path，都回顶
    if (consumeSidebarNavTop()) {
      scrollMainToTop();
      requestAnimationFrame(() => scrollMainToTop());
      return;
    }

    if (prev === pathname) return;

    // 返回列表恢复中：绝不能滚顶
    if (hasPendingRestore(pathname)) return;

    const isDrillDown =
      pathname.startsWith(`${prev}/`) ||
      (prev.startsWith("/xlh/teams") && pathname.startsWith("/xlh/members")) ||
      (prev.startsWith("/xlh/opportunities") &&
        pathname.startsWith("/xlh/opportunities/")) ||
      (prev.startsWith("/n7") &&
        pathname.startsWith("/n7/") &&
        pathname !== "/n7");

    if (isDrillDown) return;

    // 从详情「返回」列表：不滚顶（由 restoreListScroll 处理）
    // 注意：侧栏点「数据看板」不走这里（上面已 consumeSidebarNavTop）
    const backToList =
      (prev.startsWith("/xlh/members/") && pathname.startsWith("/xlh/teams")) ||
      (prev.startsWith("/xlh/opportunities/") &&
        pathname === "/xlh/opportunities") ||
      prev.startsWith("/n7/devices/") ||
      (prev.startsWith("/n7/follow-up") &&
        (pathname === "/n7" || pathname.startsWith("/n7/managers"))) ||
      (prev.startsWith("/n7/managers/") &&
        (pathname === "/n7" || pathname.startsWith("/n7/managers")));

    if (backToList) return;

    scrollMainToTop();
  }, [pathname]);

  useEffect(() => {
    const el = getMainScrollEl();
    if (!el) return;

    const onScroll = () => {
      if (hasPendingRestore(pathnameRef.current)) return;
      writeListScroll(pathnameRef.current, getMainScrollTop());
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [pathname]);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      // 侧栏链接由 Sidebar 自行 markSidebarNavTop，这里不要当成「进详情」去记滚动
      if (anchor.closest("aside")) return;

      let next: URL;
      try {
        next = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) {
        return;
      }

      const row = target.closest("[data-list-anchor]");
      const anchorId = row?.getAttribute("data-list-anchor") ?? undefined;
      captureListScroll(pathnameRef.current, anchorId);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  return null;
}
