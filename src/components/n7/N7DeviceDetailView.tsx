"use client";

import { useEffect, useState } from "react";
import { n7Path } from "@/lib/business-lines";
import { NotionAlert, NotionButton, PageHeader, PageShell } from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";

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
}

function fmt(iso: string | null, pending?: boolean, pendingLabel?: string) {
  if (pending) return pendingLabel ?? "未完成";
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function N7DeviceDetailView({ sn }: { sn: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState<"phone" | "account" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch(`/api/n7/devices/${encodeURIComponent(sn)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
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
              className="text-[#2563eb] hover:text-[#1d4ed8]"
            />
            {data && data.storeDeviceCount > 1 && (
              <span className="ml-2">该门店共 {data.storeDeviceCount} 台设备</span>
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
              <span className="font-mono text-xs text-[#64748b]">{data.deviceSn}</span>
              {data.priority && (
                <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {data.priority}
                </span>
              )}
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  data.isQualified
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {data.isQualified ? "已达标" : "不达标"}
              </span>
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
                {data.notSubscribed && <li className="text-red-700">未订阅红包活动</li>}
                {data.notCheckedIn && <li className="text-red-700">未打卡</li>}
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

          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-5 shadow-sm space-y-2 text-sm">
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
        </div>
      )}
    </PageShell>
  );
}
