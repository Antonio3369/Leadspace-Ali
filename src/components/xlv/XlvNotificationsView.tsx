"use client";
import { getFetchErrorMessage } from "@/lib/fetch-json";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { xlvPath } from "@/lib/business-lines";
import {
  XLV_NOTIFICATIONS_CHANGED,
  emitXlvNotificationsChanged,
} from "@/lib/xlv-notifications-client";
import {
  NotionAlert,
  NotionButton,
  NotionPanel,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import {
  XLV_NOTIFICATION_TYPE_FOLLOW_UP_DONE,
  XLV_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW,
  xlvNotificationTitle,
} from "@/lib/xlv-follow-up";
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
  withdrawStatus?: "pending" | "approved" | "rejected" | null;
  needsWithdrawAction?: boolean;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function isFollowUpNotification(item: NotifItem) {
  return (
    item.type === XLV_NOTIFICATION_TYPE_FOLLOW_UP_DONE ||
    item.type === XLV_NOTIFICATION_TYPE_FOLLOW_UP_REVIEW
  );
}

function isWithdrawNotification(item: NotifItem) {
  return item.type === XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING;
}

function withdrawNeedsAction(item: NotifItem) {
  return (
    item.needsWithdrawAction === true || item.withdrawStatus === "pending"
  );
}

function FollowUpNotifCard({
  item,
  onOpen,
}: {
  item: NotifItem;
  onOpen: (item: NotifItem) => void;
}) {
  return (
    <li>
      <Link
        href={xlvPath(`/devices/${encodeURIComponent(item.deviceSn)}`)}
        onClick={() => onOpen(item)}
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
  );
}

function WithdrawNotifCard({
  item,
  busy,
  onRespond,
}: {
  item: NotifItem;
  busy: boolean;
  onRespond: (item: NotifItem, action: "approve" | "reject") => void;
}) {
  const needsAction = withdrawNeedsAction(item);
  const resolvedLabel =
    item.withdrawStatus === "approved"
      ? "已同意撤机"
      : item.withdrawStatus === "rejected"
        ? "已拒绝"
        : item.read
          ? "已处理"
          : null;

  return (
    <li
      className={`rounded-[14px] border px-4 py-3 ${
        needsAction
          ? "border-sky-200 bg-sky-50/60"
          : "border-[#eef2f7] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-[#111827]">
          {xlvNotificationTitle(item.type)}
          {needsAction ? (
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
      <p className="mt-1 font-mono text-xs text-[#475569]">SN {item.deviceSn}</p>
      {needsAction && item.meta?.requestId ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <NotionButton
            type="button"
            disabled={busy}
            onClick={() => onRespond(item, "approve")}
            className="min-h-[40px]"
          >
            同意撤机
          </NotionButton>
          <NotionButton
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onRespond(item, "reject")}
            className="min-h-[40px]"
          >
            拒绝
          </NotionButton>
          <Link
            href={xlvPath(`/devices/${encodeURIComponent(item.deviceSn)}`)}
            className="inline-flex items-center text-sm text-[#2563eb] hover:text-[#1d4ed8] px-2"
          >
            查看设备
          </Link>
          <span className="self-center text-xs text-[#94a3b8]">
            查看详情不影响待确认
          </span>
        </div>
      ) : resolvedLabel ? (
        <p className="mt-2 text-xs text-[#94a3b8]">{resolvedLabel}</p>
      ) : null}
    </li>
  );
}

function NotificationSection({
  title,
  unreadLabel,
  emptyText,
  isEmpty,
  markAllLabel,
  onMarkAll,
  markAllDisabled,
  children,
}: {
  title: string;
  unreadLabel: string;
  emptyText: string;
  isEmpty: boolean;
  markAllLabel?: string;
  onMarkAll?: () => void;
  markAllDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <NotionPanel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#111827]">{title}</h2>
          <p className="text-sm text-[#64748b] mt-0.5">{unreadLabel}</p>
        </div>
        {markAllLabel && onMarkAll ? (
          <NotionButton
            type="button"
            disabled={markAllDisabled}
            onClick={onMarkAll}
          >
            {markAllLabel}
          </NotionButton>
        ) : null}
      </div>
      {isEmpty ? (
        <p className="text-sm text-[#94a3b8] py-2">{emptyText}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </NotionPanel>
  );
}

export function XlvNotificationsView({
  pageTitle = "系统通知",
}: {
  pageTitle?: string;
}) {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const followUpItems = useMemo(
    () => items.filter(isFollowUpNotification),
    [items]
  );
  const withdrawItems = useMemo(
    () => items.filter(isWithdrawNotification),
    [items]
  );
  const followUpUnread = useMemo(
    () => followUpItems.filter((it) => !it.read).length,
    [followUpItems]
  );
  const withdrawPending = useMemo(
    () => withdrawItems.filter(withdrawNeedsAction).length,
    [withdrawItems]
  );

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

  async function markAllFollowUp() {
    if (busy || followUpUnread === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/xlv/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "操作失败");
      setItems((prev) =>
        prev.map((it) =>
          isFollowUpNotification(it) ? { ...it, read: true } : it
        )
      );
      emitXlvNotificationsChanged();
    } catch (err) {
      setError(getFetchErrorMessage(err, "操作失败"));
    } finally {
      setBusy(false);
    }
  }

  function openItem(item: NotifItem) {
    if (item.read) return;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, read: true } : it))
    );
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
          it.id === item.id
            ? {
                ...it,
                read: true,
                needsWithdrawAction: false,
                withdrawStatus: action === "approve" ? "approved" : "rejected",
              }
            : it
        )
      );
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
          <HistoryBackLink
            label="← 返回"
            fallbackHref={xlvPath()}
            preferHistoryBack
            className="text-[#2563eb] hover:text-[#1d4ed8]"
          />
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {loading && (
        <p className="text-sm text-[#94a3b8]">正在加载…</p>
      )}

      {!loading && (
        <div className="space-y-4 max-w-2xl">
          <NotificationSection
            title="队员已跟进"
            isEmpty={followUpItems.length === 0}
            unreadLabel={
              followUpUnread > 0
                ? `未读 ${followUpUnread}`
                : "暂无未读"
            }
            emptyText="暂无队员跟进消息"
            markAllLabel={followUpUnread > 0 ? "全部标已读" : undefined}
            onMarkAll={() => void markAllFollowUp()}
            markAllDisabled={busy || followUpUnread === 0}
          >
            {followUpItems.map((item) => (
              <FollowUpNotifCard key={item.id} item={item} onOpen={openItem} />
            ))}
          </NotificationSection>

          <NotificationSection
            title="撤机通知"
            isEmpty={withdrawItems.length === 0}
            unreadLabel={
              withdrawPending > 0
                ? `待确认 ${withdrawPending}`
                : withdrawItems.length > 0
                  ? "暂无待确认"
                  : "暂无撤机通知"
            }
            emptyText="暂无撤机通知"
          >
            {withdrawItems.map((item) => (
              <WithdrawNotifCard
                key={item.id}
                item={item}
                busy={busy}
                onRespond={respondWithdraw}
              />
            ))}
          </NotificationSection>
        </div>
      )}
    </PageShell>
  );
}
