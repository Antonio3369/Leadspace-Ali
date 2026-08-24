"use client";

import { useCallback, useEffect, useState } from "react";
import { xlvPath } from "@/lib/business-lines";
import {
  xlvMerchantLabel,
  xlvEffectiveAlertKind,
} from "@/lib/xlv-rules";
import {
  xlvShouldShowQualificationBadge,
  xlvShouldShowSleepAlertBadge,
  xlvSleepAlertBadgeClass,
  xlvSleepAlertBadgeLabel,
} from "@/lib/xlv-device-display";
import {
  NotionAlert,
  NotionButton,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import { CopyTextButton } from "@/components/ui/CopyTextButton";
import { XlvAssessmentPanel } from "@/components/xlv/XlvAssessmentPanel";
import { XlvQualificationBadge } from "@/components/xlv/XlvQualificationBadge";
import { XlvRelocationBadge } from "@/components/xlv/XlvRelocationBadge";
import { XlvFollowUpCloseForm } from "@/components/xlv/XlvFollowUpCloseForm";
import type { XlvFollowUpPatchResult, XlvFollowUpReviewResult } from "@/lib/xlv-follow-up-client";
import { XlvTxnActivityChart } from "@/components/xlv/XlvTxnActivityChart";
import type { XlvTxnActivityPoint } from "@/services/xlv/snapshot-daily";
import type { XlvQualificationDetail } from "@/lib/xlv-rules";
import { readResponseJson, getFetchErrorMessage } from "@/lib/fetch-json";
import { emitXlvNotificationsChanged } from "@/lib/xlv-notifications-client";
import type { XlvRelocationHint } from "@/lib/xlv-relocation";

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
  followUpReviewNote?: string | null;
  followUpReviewAt?: string | null;
  followUpReviewByName?: string | null;
}

type PendingWithdraw = {
  requestId: string;
  storeName: string | null;
  withdrawManagerName: string;
  withdrawOperatorName: string;
  createdAt: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function XlvDeviceDetailView({
  sn,
  canReviewFollowUp = false,
}: {
  sn: string;
  canReviewFollowUp?: boolean;
}) {
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
  const [review, setReview] = useState({
    note: null as string | null,
    at: null as string | null,
    byName: null as string | null,
  });
  const [pendingWithdraw, setPendingWithdraw] = useState<PendingWithdraw | null>(
    null
  );
  const [relocation, setRelocation] = useState<XlvRelocationHint | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [error, setError] = useState("");

  const loadDevice = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/xlv/devices/${encodeURIComponent(sn)}`);
    const json = await readResponseJson<{
      error?: string;
      device?: Device;
      qualificationDetail?: XlvQualificationDetail;
      txnTrend?: XlvTxnActivityPoint[];
      pendingWithdraw?: PendingWithdraw | null;
      relocation?: XlvRelocationHint | null;
    }>(res, "加载设备");
    if (!res.ok) throw new Error(json.error || "加载失败");
    const d = json.device;
    if (!d) throw new Error("设备数据为空");
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
    setReview({
      note: d.followUpReviewNote ?? null,
      at: d.followUpReviewAt ? String(d.followUpReviewAt) : null,
      byName: d.followUpReviewByName ?? null,
    });
    setPendingWithdraw(json.pendingWithdraw ?? null);
    setRelocation(json.relocation ?? null);
    emitXlvNotificationsChanged();
  }, [sn]);

  useEffect(() => {
    let cancelled = false;
    void loadDevice().catch((err) => {
      if (!cancelled) {
        setError(getFetchErrorMessage(err, "加载失败"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadDevice]);

  if (!device && !error) {
    return (
      <PageShell>
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      </PageShell>
    );
  }

  const alertKind = device
    ? xlvEffectiveAlertKind({
        sleepDays: device.sleepDays,
        cumulativeTxns: device.cumulativeTxns,
        qualificationStatus: qualificationDetail?.status,
      })
    : "active";

  const showFollowUp =
    alertKind === "single_silence" ||
    alertKind === "dormant" ||
    followUp.done;
  const displayInput = {
    alertKind,
    qualificationStatus: qualificationDetail?.status,
    sleepDays: device?.sleepDays ?? 0,
    cumulativeTxns: device?.cumulativeTxns,
  };
  const sleepLabel = xlvSleepAlertBadgeLabel(alertKind);

  function onFollowUpChanged(next: XlvFollowUpPatchResult) {
    setFollowUp({
      done: next.followUpDone,
      note: next.followUpNote ?? "",
      connectStatus: next.followUpConnectStatus,
      flags: next.followUpFlags,
      photoUrls: next.followUpPhotoUrls,
      at: next.followUpAt,
    });
    if (!next.followUpDone) {
      setReview({ note: null, at: null, byName: null });
    }
  }

  function onReviewChanged(next: XlvFollowUpReviewResult) {
    setReview({
      note: next.followUpReviewNote,
      at: next.followUpReviewAt,
      byName: next.followUpReviewByName,
    });
  }

  async function respondWithdraw(action: "approve" | "reject") {
    if (!pendingWithdraw || withdrawBusy) return;
    setWithdrawBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/xlv/inventory/withdraw-requests/${encodeURIComponent(pendingWithdraw.requestId)}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = await readResponseJson<{ error?: string }>(res, "撤机确认");
      if (!res.ok) throw new Error(json.error || "操作失败");
      if (action === "approve") {
        await loadDevice();
      } else {
        setPendingWithdraw(null);
        emitXlvNotificationsChanged();
      }
    } catch (err) {
      setError(getFetchErrorMessage(err, "操作失败"));
    } finally {
      setWithdrawBusy(false);
    }
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
        <div className="flex flex-col gap-4">
          {XLV_WITHDRAW_IMPORT_ENABLED && pendingWithdraw ? (
            <div className="rounded-[14px] border border-sky-200 bg-sky-50/60 p-4 shadow-sm space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#111827]">撤机待确认</p>
                <p className="mt-1 text-sm text-[#64748b]">
                  运营已登记移机明细，请核实设备情况后确认是否同意撤机。
                  {pendingWithdraw.storeName
                    ? ` 门店：${pendingWithdraw.storeName}`
                    : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <NotionButton
                  type="button"
                  disabled={withdrawBusy}
                  onClick={() => void respondWithdraw("approve")}
                  className="min-h-[40px]"
                >
                  同意撤机
                </NotionButton>
                <NotionButton
                  type="button"
                  variant="secondary"
                  disabled={withdrawBusy}
                  onClick={() => void respondWithdraw("reject")}
                  className="min-h-[40px]"
                >
                  拒绝
                </NotionButton>
              </div>
            </div>
          ) : null}

          <div className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {xlvShouldShowSleepAlertBadge(displayInput) && sleepLabel ? (
                <span
                  className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${xlvSleepAlertBadgeClass(alertKind)}`}
                >
                  {sleepLabel}
                </span>
              ) : null}
              {qualificationDetail &&
              xlvShouldShowQualificationBadge(displayInput) ? (
                <XlvQualificationBadge status={qualificationDetail.status} />
              ) : null}
              {relocation?.fromStore ? (
                <XlvRelocationBadge fromStore={relocation.fromStore} />
              ) : null}
              <span className="text-xs font-mono text-[#94a3b8]">{device.deviceSn}</span>
              <CopyTextButton text={device.deviceSn} />
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-[#94a3b8] text-xs">队员</dt>
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
              {relocation?.fromStore ? (
                <div>
                  <dt className="text-[#94a3b8] text-xs">原门店</dt>
                  <dd className="font-medium">{relocation.fromStore}</dd>
                </div>
              ) : null}
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
            <section
              id="xlv-follow-up"
              className="rounded-[14px] border border-[#eef2f7] bg-white p-4 shadow-sm scroll-mt-4"
            >
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
                canReview={canReviewFollowUp && followUp.done}
                reviewNote={review.note}
                reviewAt={review.at}
                reviewByName={review.byName}
                onChanged={onFollowUpChanged}
                onReviewChanged={onReviewChanged}
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
