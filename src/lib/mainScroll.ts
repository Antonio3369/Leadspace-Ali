/** 与 hk.orblead 一致：页面滚动在 #app-scroll 内，不依赖 window.scrollY（Safari 更稳） */

export const APP_SCROLL_SELECTOR = "#app-scroll";

const LIST_SCROLL_PREFIX = "leadspace:list-scroll:";
const LIST_ANCHOR_PREFIX = "leadspace:list-anchor:";
const RESTORE_FLAG_PREFIX = "leadspace:restore:";
const LAST_LIST_KEY = "leadspace:last-list-key";
const RESTORE_AFTER_BACK = "leadspace:restore-after-back";
const SIDEBAR_NAV_TOP = "leadspace:sidebar-nav-top";

export function getMainScrollEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(APP_SCROLL_SELECTOR);
}

export function getMainScrollTop(): number {
  const el = getMainScrollEl();
  if (el) return el.scrollTop;
  return window.scrollY || window.pageYOffset || 0;
}

export function scrollMainTo(top: number) {
  const y = Math.max(0, Math.round(top));
  const el = getMainScrollEl();
  if (el) {
    el.scrollTop = y;
    return;
  }
  window.scrollTo(0, y);
}

export function scrollMainToTop() {
  scrollMainTo(0);
}

export function writeListScroll(listKey: string, y: number) {
  try {
    sessionStorage.setItem(`${LIST_SCROLL_PREFIX}${listKey}`, String(y));
  } catch {
    /* ignore */
  }
}

export function readListScroll(listKey: string): number {
  try {
    const raw = sessionStorage.getItem(`${LIST_SCROLL_PREFIX}${listKey}`);
    const y = raw == null ? 0 : Number(raw);
    return Number.isFinite(y) ? y : 0;
  } catch {
    return 0;
  }
}

export function writeListAnchor(listKey: string, anchorId: string) {
  try {
    sessionStorage.setItem(`${LIST_ANCHOR_PREFIX}${listKey}`, anchorId);
  } catch {
    /* ignore */
  }
}

export function readListAnchor(listKey: string): string | null {
  try {
    return sessionStorage.getItem(`${LIST_ANCHOR_PREFIX}${listKey}`);
  } catch {
    return null;
  }
}

export function clearListAnchor(listKey: string) {
  try {
    sessionStorage.removeItem(`${LIST_ANCHOR_PREFIX}${listKey}`);
  } catch {
    /* ignore */
  }
}

export function markListRestore(listKey: string) {
  try {
    sessionStorage.setItem(`${RESTORE_FLAG_PREFIX}${listKey}`, "1");
  } catch {
    /* ignore */
  }
}

export function consumeListRestore(listKey: string): boolean {
  try {
    if (sessionStorage.getItem(`${RESTORE_FLAG_PREFIX}${listKey}`) !== "1") return false;
    sessionStorage.removeItem(`${RESTORE_FLAG_PREFIX}${listKey}`);
    return true;
  } catch {
    return false;
  }
}

/** 进入详情前调用：记下列表滚动与行锚点 */
export function captureListScroll(listKey: string, anchorId?: string) {
  writeListScroll(listKey, getMainScrollTop());
  if (anchorId) writeListAnchor(listKey, anchorId);
  markListRestore(listKey);
  try {
    sessionStorage.setItem(LAST_LIST_KEY, listKey);
  } catch {
    /* ignore */
  }
}

export function readLastListKey(): string | null {
  try {
    return sessionStorage.getItem(LAST_LIST_KEY);
  } catch {
    return null;
  }
}

/** history.back 后，对落地页 pathname 做一次恢复 */
export function markRestoreAfterBack() {
  try {
    sessionStorage.setItem(RESTORE_AFTER_BACK, "1");
  } catch {
    /* ignore */
  }
}

export function consumeRestoreAfterBack(): boolean {
  try {
    if (sessionStorage.getItem(RESTORE_AFTER_BACK) !== "1") return false;
    sessionStorage.removeItem(RESTORE_AFTER_BACK);
    return true;
  } catch {
    return false;
  }
}

/** 侧栏一级导航：强制回顶，并取消待恢复的列表滚动 */
export function markSidebarNavTop(targetPathname?: string) {
  try {
    sessionStorage.removeItem(RESTORE_AFTER_BACK);
    if (targetPathname) {
      sessionStorage.removeItem(`${RESTORE_FLAG_PREFIX}${targetPathname}`);
    }
    const samePage =
      typeof window !== "undefined" &&
      !!targetPathname &&
      targetPathname === window.location.pathname;
    // 跨页：留给 ScrollMemory 在落地后再滚一次；同页：当场滚顶并清标记
    if (samePage) {
      sessionStorage.removeItem(SIDEBAR_NAV_TOP);
    } else {
      sessionStorage.setItem(SIDEBAR_NAV_TOP, "1");
    }
  } catch {
    /* ignore */
  }
  scrollMainToTop();
}

export function consumeSidebarNavTop(): boolean {
  try {
    if (sessionStorage.getItem(SIDEBAR_NAV_TOP) !== "1") return false;
    sessionStorage.removeItem(SIDEBAR_NAV_TOP);
    return true;
  } catch {
    return false;
  }
}

export function isSidebarNavTopPending(): boolean {
  try {
    return sessionStorage.getItem(SIDEBAR_NAV_TOP) === "1";
  } catch {
    return false;
  }
}

function escapeAnchor(id: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/["\\]/g, "\\$&");
}

/**
 * 返回列表后恢复（对齐 hk.orblead App.tsx）：
 * scrollTop 多次补写 + 行 scrollIntoView 兜底
 */
export function restoreListScroll(listKey: string): () => void {
  const y = readListScroll(listKey);
  const anchor = readListAnchor(listKey);

  const restore = () => {
    scrollMainTo(y);
    if (anchor) {
      const el = document.querySelector(`[data-list-anchor="${escapeAnchor(anchor)}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    }
  };

  restore();
  const timers = [0, 50, 150, 400, 800].map((ms) => window.setTimeout(restore, ms));
  let raf2 = 0;
  const raf1 = requestAnimationFrame(() => {
    restore();
    raf2 = requestAnimationFrame(restore);
  });

  const done = window.setTimeout(() => {
    clearListAnchor(listKey);
  }, 900);

  return () => {
    timers.forEach(clearTimeout);
    clearTimeout(done);
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  };
}
