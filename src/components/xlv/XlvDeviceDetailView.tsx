"use client";

import { useEffect, useState } from "react";
import { xlvPath } from "@/lib/business-lines";
import {
  XLV_ALERT_LABELS,
  classifyXlvAlert,
  xlvMerchantLabel,
} from "@/lib/xlv-rules";
import {
  NotionAlert,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import { CopyTextButton } from "@/components/ui/CopyTextButton";
import { XlvAssessmentPanel } from "@/components/xlv/XlvAssessmentPanel";
import { XlvQualificationBadge } from "@/components/xlv/XlvQualificationBadge";
import { XlvFollowUpCloseForm } from "@/components/xlv/XlvFollowUpCloseForm";
import type { XlvFollowUpPatchResult } from "@/lib/xlv-follow-up-client";
import { XlvTxnActivityChart } from "@/components/xlv/XlvTxnActivityChart";
import type { XlvTxnActivityPoint } from "@/services/xlv/snapshot-daily";
import type { XlvQualificationDetail } from "@/lib/xlv-rules";

interface Device {
  deviceSn: string;
  merchantName: string | null;
  activationMerchantName: string | null;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  cumulativeAmount: number;
  sleepDays: number;
  lastTxnDate: string | null;
  firstTxnDate: string | null;
  statDate: string | null;
  dailyTxns: number;
  dailyUsers: number;
  isActivated: boolean;
  followUpDone?: boolean;
  followUpNote?: string | null;
  followUpAt?: string | null;
  followUpConnectStatus?: string | null;
  followUpFlags?: string[];
  followUpPhotoUrls?: string[];
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function XlvDeviceDetailView({ sn }: { sn: string }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [qualificationDetail, setQualificationDetail] =
    useState<XlvQualificationDetail | null>(null);
  const [txnTrend, setTxnTrend] = useState<XlvTxnActivityPoint[]>([]);
  const [followUp, setFollowUp] = useState({
    done: false,
    note: "",
    connectStatus: null as string | null,
    flags: [] as string[],
    photoUrls: [] as string[],
    at: null as string | null,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch(`/api/xlv/devices/${encodeURIComponent(sn)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) {
          const d = json.device;
          setDevice({
            ...d,
            lastTxnDate: d.lastTxnDate ? String(d.lastTxnDate).slice(0, 10) : null,
            firstTxnDate: d.firstTxnDate ? String(d.firstTxnDate).slice(0, 10) : null,
            statDate: d.statDate ? String(d.statDate).slice(0, 10) : null,
          });
          setQualificationDetail(json.qualificationDetail ?? null);
          setTxnTrend(json.txnTrend ?? []);
          setFollowUp({
            done: Boolean(d.followUpDone),
            note: d.followUpNote ?? "",
            connectStatus: d.followUpConnectStatus ?? null,
            flags: d.followUpFlags ?? [],
            photoUrls: d.followUpPhotoUrls ?? [],
            at: d.followUpAt ? String(d.followUpAt) : null,
          });
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

  if (!device && !error) {
    return (
      <PageShell>
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      </PageShell>
    );
  }

  const alertKind = device
    ? classifyXlvAlert({
        sleepDays: device.sleepDays,
        cumulativeTxns: device.cumulativeTxns,
      })
    : "active";

  const showFollowUp =
    alertKind === "single_silence" || alertKind === "dormant";

  function onFollowUpChanged(next: XlvFollowUpPatchResult) {
    setFollowUp({
      done: next.followUpDone,
      note: next.followUpNote ?? "",
      connectStatus: next.followUpConnectStatus,
      flags: next.followUpFlags,
      photoUrls: next.followUpPhotoUrls,
      at: next.followUpAt,
    });
  }

  return (
    <PageShell>
      <PageHeader
        title={device ? xlvMerchantLabel(device) : "设备详情"}
        kicker="微信小绿盒"
        titleSuffix={
          device ? (
            <CopyTextButton text={xlvMerchantLabel(device)} />
          ) : undefined
        }
        meta={
          <HistoryBackLink
            label="← 返回"
            fallbackHref={xlvPath()}
            preferHistoryBack
            className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
          />
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}

      {device ? (
        <div className="space-y-4">
          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
                  alertKind === "single_silence"
                    ? "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]"
                    : alertKind === "dormant"
                      ? "bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]"
                      : "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]"
                }`}
              >
                {XLV_ALERT_LABELS[alertKind]}
              </span>
              {qualificationDetail ? (
                <XlvQualificationBadge status={qualificationDetail.status} />
              ) : null}
              <span className="text-xs font-mono text-[#94a3b8]">{device.deviceSn}</span>
              <CopyTextButton text={device.deviceSn} />
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-[#94a3b8] text-xs">作业员</dt>
                <dd className="font-medium">{device.operatorName || "—"}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">经理</dt>
                <dd className="font-medium">{device.managerName || "—"}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">公司</dt>
                <dd className="font-medium">{device.companyName || "—"}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">首笔交易</dt>
                <dd className="tabular-nums">{fmtDate(device.firstTxnDate)}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">末笔交易</dt>
                <dd className="tabular-nums">{fmtDate(device.lastTxnDate)}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">沉睡天数</dt>
                <dd className="tabular-nums font-semibold text-[#c41e3a]">
                  {device.sleepDays} 天
                </dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">累计用户</dt>
                <dd className="tabular-nums">{device.cumulativeUsers}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">累计笔数</dt>
                <dd className="tabular-nums">{device.cumulativeTxns}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] text-xs">累计金额</dt>
                <dd className="tabular-nums">¥{device.cumulativeAmount.toFixed(2)}</dd>
              </div>
            </dl>
          </div>

          {qualificationDetail ? (
            <XlvAssessmentPanel
              detail={qualificationDetail}
              firstTxnDate={device.firstTxnDate}
            />
          ) : null}

          {showFollowUp ? (
            <section className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-[#111827] mb-3">
                沉睡回访
              </h2>
              <XlvFollowUpCloseForm
                deviceSn={device.deviceSn}
                done={followUp.done}
                note={followUp.note}
                connectStatus={followUp.connectStatus}
                flags={followUp.flags}
                photoUrls={followUp.photoUrls}
                followUpAt={followUp.at}
                onChanged={onFollowUpChanged}
              />
            </section>
          ) : null}

          <section className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[#111827] mb-3">
              交易趋势
              {device.lastTxnDate ? (
                <span className="ml-2 text-xs font-normal text-[#94a3b8]">
                  末笔 {device.lastTxnDate}
                </span>
              ) : null}
            </h2>
            <XlvTxnActivityChart points={txnTrend} />
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}
