"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { xlvPath } from "@/lib/business-lines";
import { useRestoreListScroll } from "@/hooks/useRestoreListScroll";
import { HistoryBackLink } from "@/components/ui/HistoryBackLink";
import {
  NotionAlert,
  PageHeader,
  PageShell,
} from "@/components/ui/notion";
import { XlvDeviceCardList } from "@/components/xlv/XlvDeviceCardList";
import {
  XlvFilterChipText,
  xlvAlertButtonClass,
  xlvFilterChipBaseClass,
  xlvTabButtonClass,
} from "@/components/xlv/xlv-filter-styles";
import type { XlvDeviceListItem } from "@/services/xlv/analytics";
import {
  XLV_ALERT_FILTERS,
  parseXlvAlertKind,
  parseXlvQualificationStatus,
  classifyXlvAlert,
  type XlvAlertKind,
  type XlvQualificationStatus,
} from "@/lib/xlv-rules";
import {
  resolveXlvDeviceSortMode,
  sortXlvDevices,
} from "@/services/xlv/sort-devices";

interface ApiDevice {
  deviceSn: string;
  merchantName: string | null;
  activationMerchantName: string | null;
  operatorName: string;
  managerName: string;
  companyName: string | null;
  cumulativeUsers: number;
  cumulativeTxns: number;
  sleepDays: number;
  lastTxnDate: string | null;
  firstTxnDate: string | null;
  qualificationStatus: XlvQualificationStatus;
  qualificationGap?: { usersGap: number; txnsGap: number; line: string };
}

interface ApiResponse {
  manager: { key: string; name: string };
  staff: { key: string; name: string };
  devices: ApiDevice[];
}

function mapDevice(d: ApiDevice): XlvDeviceListItem {
  return {
    ...d,
    alertKind: classifyXlvAlert(d),
    qualificationGapLine: d.qualificationGap?.line,
  };
}

export function XlvStaffDevicesView({
  managerKey,
  staffKey,
  backHref,
  viewerRole,
}: {
  managerKey: string;
  staffKey: string;
  backHref?: string;
  viewerRole?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const alert = parseXlvAlertKind(searchParams.get("alert"));
  const status = parseXlvQualificationStatus(searchParams.get("status"));

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useRestoreListScroll(pathname, !loading && !!data);

  function setStatusFilter(next: XlvQualificationStatus | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next) params.delete("status");
    else {
      params.set("status", next);
      params.delete("alert");
    }
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  function setAlertFilter(next: XlvAlertKind) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("alert");
    else params.set("alert", next);
    params.delete("status");
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(
      `/api/xlv/managers/${encodeURIComponent(managerKey)}/staff/${encodeURIComponent(staffKey)}/devices`
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managerKey, staffKey]);

  const allDevices = (data?.devices ?? []).map(mapDevice);
  const filtered = (data?.devices ?? []).filter((d) => {
    if (status === "qualified") return d.qualificationStatus === "qualified";
    if (status === "invalid") return d.qualificationStatus === "invalid";
    if (status === "in_progress") return d.qualificationStatus === "in_progress";
    if (alert !== "all") return classifyXlvAlert(d) === alert;
    return true;
  });
  const devices = sortXlvDevices(
    filtered,
    resolveXlvDeviceSortMode({ alert, qualificationStatus: status }),
    status
  ).map(mapDevice);
  const counts = {
    all: allDevices.length,
    qualified: allDevices.filter((d) => d.qualificationStatus === "qualified")
      .length,
    in_progress: allDevices.filter((d) => d.qualificationStatus === "in_progress")
      .length,
    invalid: allDevices.filter((d) => d.qualificationStatus === "invalid").length,
    single_silence: allDevices.filter((d) => d.alertKind === "single_silence").length,
    dormant: allDevices.filter((d) => d.alertKind === "dormant").length,
    active: allDevices.filter((d) => d.alertKind === "active").length,
  };

  const defaultBack = xlvPath(
    `/managers/${encodeURIComponent(managerKey)}`
  );

  const isSelfView = viewerRole === "SALES";

  return (
    <PageShell>
      <PageHeader
        title={isSelfView ? "设备看板" : `${data?.staff.name ?? "队员"} · 设备`}
        kicker="微信小绿盒"
        meta={
          !isSelfView ? (
            <div className="space-y-1 text-sm text-[#64748b]">
              {data?.manager.name ? <p>经理：{data.manager.name}</p> : null}
              <HistoryBackLink
                label="← 返回队员排行"
                fallbackHref={backHref ?? defaultBack}
                preferHistoryBack
                className="inline-flex text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
              />
            </div>
          ) : undefined
        }
      />

      {error ? <NotionAlert tone="error">{error}</NotionAlert> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setStatusFilter(null);
            setAlertFilter("all");
          }}
          className={`${xlvFilterChipBaseClass()} ${xlvTabButtonClass(alert === "all" && !status)}`}
        >
          <XlvFilterChipText label="全部" count={counts.all} active={alert === "all" && !status} />
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("qualified")}
          className={`${xlvFilterChipBaseClass()} ${xlvTabButtonClass(status === "qualified")}`}
        >
          <XlvFilterChipText
            label="已达标"
            count={counts.qualified}
            active={status === "qualified"}
          />
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("in_progress")}
          className={`${xlvFilterChipBaseClass()} ${xlvTabButtonClass(status === "in_progress")}`}
        >
          <XlvFilterChipText
            label="考核中"
            count={counts.in_progress}
            active={status === "in_progress"}
          />
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("invalid")}
          className={`${xlvFilterChipBaseClass()} ${xlvTabButtonClass(status === "invalid")}`}
        >
          <XlvFilterChipText
            label="无效用户"
            count={counts.invalid}
            active={status === "invalid"}
          />
        </button>
        {XLV_ALERT_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setAlertFilter(item.id)}
            className={`${xlvFilterChipBaseClass()} ${xlvAlertButtonClass(
              item.id,
              alert === item.id
            )}`}
          >
            <XlvFilterChipText
              label={item.label}
              count={counts[item.id]}
              active={alert === item.id}
            />
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : (
        <XlvDeviceCardList
          devices={devices}
          showManager={false}
          emptyText={isSelfView ? "暂无设备" : "该队员暂无设备"}
          linkToDetail
        />
      )}
    </PageShell>
  );
}
