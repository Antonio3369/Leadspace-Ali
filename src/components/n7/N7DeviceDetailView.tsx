"use client";

import { useEffect, useState } from "react";
import { n7Path } from "@/lib/business-lines";
import { patchN7DeviceFollowUp } from "@/lib/n7-follow-up-client";
import {
  NotionAlert,
  NotionButton,
  PageHeader,
  PageShell,
  notion,
} from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import { N7FollowUpBadge } from "@/components/n7/N7FollowUpBadge";
import { N7PriorityBadge } from "@/components/n7/N7PriorityBadge";

interface Detail {
  deviceSn: string;
  storeName: string | null;
  storeAddress: string | null;
  storePhone: string | null;
  merchantPhone: string | null;
  merchantAccount: string | null;
  merchantId: string | null;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  registeredAt: string | null;
  litAt: string | null;
  subscribedAt: string | null;
  firstCheckInAt: string | null;
  notLit: boolean;
  notSubscribed: boolean;
  notCheckedIn: boolean;
  assessmentStartAt: string | null;
  assessmentEndAt: string | null;
  remainingDays: number | null;
  remainingEnded: boolean;
  effectiveDays: number;
  effectiveUsers: number;
  isQualified: boolean;
  priority: "P0" | "P1" | "P2" | "P3" | null;
  failReason: string | null;
  daysGap: number;
  usersGap: number;
  storeDeviceCount: number;
  phase2Days: number;
  phase2Users: number;
  followUpDone: boolean;
  followUpNote: string | null;
  followUpAt: string | null;
}

function fmt(iso: string | null, pending?: boolean, pendingLabel?: string) {
  if (pending) return pendingLabel ?? "未完成";
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function N7DeviceDetailView({ sn }: { sn: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState<"phone" | "account" | null>(
    null
  );
  const [followUpDone, setFollowUpDone] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [followSaving, setFollowSaving] = useState(false);
  const [followMessage, setFollowMessage] = useState("");
  const [followError, setFollowError] = useState("");

  const noteDirty = followUpNote.trim() !== savedNote.trim();

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch(`/api/n7/devices/${encodeURIComponent(sn)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) {
          setData(json);
          setFollowUpDone(Boolean(json.followUpDone));
          const note = json.followUpNote ?? "";
          setFollowUpNote(note);
          setSavedNote(note);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sn]);

  async function copyText(field: "phone" | "account", value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  function applyFollowResult(json: {
    followUpDone: boolean;
    followUpNote: string | null;
    followUpAt: string | null;
  }) {
    setFollowUpDone(json.followUpDone);
    const note = json.followUpNote ?? "";
    setFollowUpNote(note);
    setSavedNote(note);
    setData((prev) =>
      prev
        ? {
            ...prev,
            followUpDone: json.followUpDone,
            followUpNote: json.followUpNote,
            followUpAt: json.followUpAt,
          }
        : prev
    );
  }

  async function saveStatus(nextDone: boolean) {
    if (followSaving) return;
    setFollowSaving(true);
    setFollowError("");
    setFollowMessage("");
    try {
      const json = await patchN7DeviceFollowUp(sn, {
        followUpDone: nextDone,
        followUpNote: followUpNote.trim() || null,
      });
      applyFollowResult(json);
      setFollowMessage(nextDone ? "已标记为已处理" : "已改回未处理");
    } catch (err) {
      setFollowError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setFollowSaving(false);
    }
  }

  async function saveNoteOnly() {
    if (followSaving || !noteDirty) return;
    setFollowSaving(true);
    setFollowError("");
    setFollowMessage("");
    try {
      const json = await patchN7DeviceFollowUp(sn, {
        followUpDone,
        followUpNote: followUpNote.trim() || null,
      });
      applyFollowResult(json);
      setFollowMessage("备注已保存");
    } catch (err) {
      setFollowError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setFollowSaving(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={data?.storeName || sn}
        kicker="设备问题详情"
        meta={
          <p className="text-sm text-[#64748b]">
            <HistoryBackLink
              label="← 返回"
              fallbackHref={n7Path()}
              preferHistoryBack
              className="text-[#2563eb] hover:text-[#1d4ed8]"
            />
            {data && data.storeDeviceCount > 1 && (
              <span className="ml-2">
                该门店共 {data.storeDeviceCount} 台设备
              </span>
            )}
          </p>
        }
      />

      {error && <NotionAlert tone="error">{error}</NotionAlert>}
      {!data && !error && (
        <p className="text-sm text-[#94a3b8]">加载中…</p>
      )}

      {data && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-[#64748b]">
                {data.deviceSn}
              </span>
              {data.priority && <N7PriorityBadge p={data.priority} />}
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  data.isQualified
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {data.isQualified ? "已达标" : "不达标"}
              </span>
              <N7FollowUpBadge
                done={data.followUpDone}
                note={data.followUpNote}
              />
              <span className="text-sm text-[#64748b]">
                剩余{" "}
                {data.remainingEnded
                  ? "已结束"
                  : data.remainingDays == null
                    ? "—"
                    : `${data.remainingDays} 天`}
              </span>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                问题
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[#111827]">
                {data.isQualified ? (
                  <li>双指标已满足（有效天数 / 用户数 ≥ 3）</li>
                ) : (
                  <>
                    <li>
                      有效天数 {data.effectiveDays} / 3
                      {data.daysGap > 0 ? `（还差 ${data.daysGap} 天）` : ""}
                    </li>
                    <li>
                      有效用户 {data.effectiveUsers} / 3
                      {data.usersGap > 0 ? `（还差 ${data.usersGap} 人）` : ""}
                    </li>
                    {data.failReason && <li>原因：{data.failReason}</li>}
                  </>
                )}
                {data.notLit && <li className="text-red-700">未点亮</li>}
                {data.notSubscribed && (
                  <li className="text-red-700">未订阅红包活动</li>
                )}
                {data.notCheckedIn && (
                  <li className="text-red-700">未打卡</li>
                )}
              </ul>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-5 shadow-sm space-y-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
              进度
            </p>
            <p>
              考核：{fmt(data.assessmentStartAt)} — {fmt(data.assessmentEndAt)}
            </p>
            <p>注册：{fmt(data.registeredAt)}</p>
            <p>点亮：{fmt(data.litAt, data.notLit, "未点亮")}</p>
            <p>订阅：{fmt(data.subscribedAt, data.notSubscribed, "未订阅")}</p>
            <p>打卡：{fmt(data.firstCheckInAt, data.notCheckedIn, "未打卡")}</p>
          </div>

          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-5 shadow-sm space-y-4 text-sm">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                联系
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span>手机 {data.merchantPhone || "—"}</span>
                {data.merchantPhone && (
                  <NotionButton
                    type="button"
                    onClick={() => copyText("phone", data.merchantPhone!)}
                  >
                    {copiedField === "phone" ? "已复制" : "复制"}
                  </NotionButton>
                )}
              </div>
              <p>门店电话 {data.storePhone || "—"}</p>
              <p>地址 {data.storeAddress || "—"}</p>
              <p>
                作业 {data.operatorName} · 经理 {data.managerName}
                {data.companyName ? ` · ${data.companyName}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[#94a3b8]">
                <span>商户账号 {data.merchantAccount || "—"}</span>
                {data.merchantAccount && (
                  <NotionButton
                    type="button"
                    onClick={() => copyText("account", data.merchantAccount!)}
                  >
                    {copiedField === "account" ? "已复制" : "复制"}
                  </NotionButton>
                )}
                <span>· 商户ID {data.merchantId || "—"}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#f1f5f9] space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                  处理状态
                </p>
                <p className="mt-1 text-xs text-[#94a3b8]">
                  是否已跟进过；不影响考核名单。点选即保存。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={followSaving}
                  onClick={() => {
                    if (!followUpDone) return;
                    void saveStatus(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors disabled:opacity-50 ${
                    !followUpDone
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc]"
                  }`}
                >
                  未处理
                </button>
                <button
                  type="button"
                  disabled={followSaving}
                  onClick={() => {
                    if (followUpDone) return;
                    void saveStatus(true);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors disabled:opacity-50 ${
                    followUpDone
                      ? "border-sky-300 bg-sky-50 text-sky-900"
                      : "border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc]"
                  }`}
                >
                  {followSaving && !followUpDone ? "保存中…" : "已处理"}
                </button>
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1.5">
                  处理备注（选填）
                </label>
                <textarea
                  value={followUpNote}
                  onChange={(e) => {
                    setFollowUpNote(e.target.value);
                    setFollowMessage("");
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder="沟通结果、下次动作等"
                  className={`${notion.input} w-full resize-y min-h-[56px]`}
                />
              </div>
              {data.followUpAt && data.followUpDone && (
                <p className="text-xs text-[#94a3b8]">
                  上次标记：{fmt(data.followUpAt)}
                </p>
              )}
              {followError && (
                <NotionAlert tone="error">{followError}</NotionAlert>
              )}
              {followMessage && (
                <NotionAlert tone="success">{followMessage}</NotionAlert>
              )}
              {noteDirty && (
                <NotionButton
                  type="button"
                  disabled={followSaving}
                  onClick={() => void saveNoteOnly()}
                >
                  {followSaving ? "保存中…" : "保存备注"}
                </NotionButton>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
