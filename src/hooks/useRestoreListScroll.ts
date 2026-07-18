"use client";

import { useEffect } from "react";
import {
  consumeListRestore,
  consumeRestoreAfterBack,
  isSidebarNavTopPending,
  markListRestore,
  restoreListScroll,
  scrollMainToTop,
} from "@/lib/mainScroll";

/** 列表数据就绪后恢复滚动（N7 / 团队明细等异步页） */
export function useRestoreListScroll(listKey: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;

    // 侧栏跳转优先回顶，不恢复旧位置
    if (isSidebarNavTopPending()) {
      scrollMainToTop();
      return;
    }

    // history.back 落地：按当前页 key 恢复
    if (consumeRestoreAfterBack()) {
      markListRestore(listKey);
      return restoreListScroll(listKey);
    }

    if (!consumeListRestore(listKey)) return;
    return restoreListScroll(listKey);
  }, [listKey, ready]);
}
