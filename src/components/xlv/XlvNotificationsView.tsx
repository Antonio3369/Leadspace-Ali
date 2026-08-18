"use client";
import { getFetchErrorMessage } from "@/lib/fetch-json";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { xlvPath } from "@/lib/business-lines";
import {
  XLV_NOTIFICATIONS_CHANGED,
  emitXlvNotificationsChanged,
} from "@/lib/xlv-notifications-client";
import {
  NotionAlert,
  NotionButton,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { XLV_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW, xlvNotificationTitle } from "@/lib/xlv-follow-up";
import { XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING } from "@/lib/xlv-withdraw";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";

type NotifItem = {
  id: string;
  type: string;
  deviceSn: string;
  title: string;
  body: string;
  meta: {
    photoUrls?: string[];
    connectStatus?: string | null;
    flags?: string[];
    followUpAt?: string;
    reviewNote?: string;
    requestId?: string;
    merchantName?: string | null;
    storeName?: string | null;
  } | null;
  read: boolean;
  createdAt: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function XlvNotificationsView({
  pageTitle = "消息通知",
}: {
  pageTitle?: string;
}) {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError("");
    }
    fetch("/api/xlv/notifications")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        setItems(json.items ?? []);
        setUnread(json.unread ?? 0);
      })
      .catch((err) => {
        if (!opts?.silent) {
          setError(getFetchErrorMessage(err, "加载失败"));
        }
      })
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) load({ silent: true });
    }
    function onVisible() {
      if (document.visibilityState === "visible") load({ silent: true });
    }
    function onChanged() {
      load({ silent: true });
    }
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(XLV_NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(XLV_NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [load]);

  async function markAll() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/xlv/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "操作失败");
      setItems((prev) => prev.map((it) => ({ ...it, read: true })));
      setUnread(0);
      emitXlvNotificationsChanged();
    } catch (err) {
      setError(getFetchErrorMessage(err, "操作失败"));
    } finally {
      setBusy(false);
    }
  }

  function openItem(item: NotifItem) {
    if (item.type === XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING) return;
    if (item.read) return;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, read: true } : it))
    );
    setUnread((n) => Math.max(0, n - 1));
    emitXlvNotificationsChanged();
    void fetch("/api/xlv/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
  }

  async function respondWithdraw(
    item: NotifItem,
    action: "approve" | "reject"
  ) {
    const requestId = item.meta?.requestId;
    if (!requestId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/xlv/inventory/withdraw-requests/${encodeURIComponent(requestId)}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "操作失败");
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, read: true } : it
        )
      );
      setUnread((n) => Math.max(0, n - (item.read ? 0 : 1)));
      emitXlvNotificationsChanged();
    } catch (err) {
      setError(getFetchErrorMessage(err, "操作失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={pageTitle}
        kicker="提醒通知"
        meta={
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#64748b]">
            <HistoryBackLink
              label="← 返回"
              fallbackHref={xlvPath()}
              preferHistoryBack
              className="text-[#2563eb] hover:text-[#1d4ed8]"
            />
            <span>未读 {unread}</span>
            {unread > 0 && (
              <NotionButton
                type="button"
                disabled={busy}
                onClick={() => void markAll()}
              >
                全部标已读
              </NotionButton>
            )}
          </div>
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && (
        <p className="text-sm text-[#94a3b8]">正在加载…</p>
      )}

      {!loading && items.length === 0 && (
        <p className="text-sm text-[#94a3b8]">暂无消息</p>
      )}

      <ul className="space-y-2 max-w-2xl">
        {items.map((item) =>
          item.type === XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING ? (
            <li
              key={item.id}
              className={`rounded-[14px] border px-4 py-3 ${
                item.read
                  ? "border-[#eef2f7] bg-white"
                  : "border-sky-200 bg-sky-50/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium text-[#111827]">
                  {xlvNotificationTitle(item.type)}
                  {!item.read ? (
                    <span className="inline-flex items-center justify-center rounded-full bg-[#ef4444] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      待确认
                    </span>
                  ) : null}
                </p>
                <span className="shrink-0 text-[0.7rem] text-[#94a3b8] tabular-nums">
                  {fmt(item.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#64748b]">{item.body}</p>
              <p className="mt-1 font-mono text-xs text-[#475569]">
                SN {item.deviceSn}
              </p>
              {!item.read && item.meta?.requestId ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <NotionButton
                    type="button"
                    disabled={busy}
                    onClick={() => void respondWithdraw(item, "approve")}
                    className="min-h-[40px]"
                  >
                    同意撤机
                  </NotionButton>
                  <NotionButton
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void respondWithdraw(item, "reject")}
                    className="min-h-[40px]"
                  >
                    拒绝
                  </NotionButton>
                  <Link
                    href={xlvPath(
                      `/devices/${encodeURIComponent(item.deviceSn)}`
                    )}
                    className="inline-flex items-center text-sm text-[#2563eb] hover:text-[#1d4ed8] px-2"
                  >
                    查看设备
                  </Link>
                </div>
              ) : item.read ? (
                <p className="mt-2 text-xs text-[#94a3b8]">已处理</p>
              ) : null}
            </li>
          ) : (
            <li key={item.id}>
              <Link
                href={xlvPath(`/devices/${encodeURIComponent(item.deviceSn)}`)}
                onClick={() => openItem(item)}
                className={`block rounded-[14px] border px-4 py-3 transition-colors ${
                  item.read
                    ? "border-[#eef2f7] bg-white"
                    : "border-sky-200 bg-sky-50/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-[#111827]">
                    {xlvNotificationTitle(item.type)}
                    {!item.read ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-[#ef4444] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        未读
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center rounded-full bg-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#64748b]">
                        已读
                      </span>
                    )}
                  </p>
                  <span className="shrink-0 text-[0.7rem] text-[#94a3b8] tabular-nums">
                    {fmt(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#64748b]">{item.body}</p>
                {item.type === XLV_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW ? (
                  <p className="mt-1 text-xs text-[#94a3b8]">
                    点进详情查看反馈并改进回访
                  </p>
                ) : item.meta?.photoUrls && item.meta.photoUrls.length > 0 ? (
                  <p className="mt-1 text-xs text-[#94a3b8]">
                    含 {item.meta.photoUrls.length} 张跟进图 · 点进详情审阅
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#94a3b8]">点进详情审阅</p>
                )}
              </Link>
            </li>
          )
        )}
      </ul>
    </PageShell>
  );
}
