"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readResponseJson, getFetchErrorMessage } from "@/lib/fetch-json";
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
  XLV_SLEEP_ALERT_FILTERS,
  isXlvQualificationInProgressActive,
  parseXlvAlertKind,
  parseXlvQualificationStatus,
  xlvEffectiveAlertKind,
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
  monthProgressLine?: string;
  followUpDone?: boolean;
  relocation?: { fromStore: string; toStore: string } | null;
}

interface ApiResponse {
  manager: { key: string; name: string };
  staff: { key: string; name: string };
  devices: ApiDevice[];
  undeployedStock: { deviceSn: string; channel: string | null; updatedAt: string }[];
}

function mapDevice(d: ApiDevice): XlvDeviceListItem {
  return {
    ...d,
    alertKind: xlvEffectiveAlertKind(d),
    qualificationGapLine: d.qualificationGap?.line,
    monthProgressLine: d.monthProgressLine,
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
  const stockUndeployed = searchParams.get("stock") === "undeployed";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useRestoreListScroll(pathname, !loading && !!data);

  function setStockFilter(active: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.set("stock", "undeployed");
      params.delete("status");
      params.delete("alert");
    } else {
      params.delete("stock");
    }
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  function setStatusFilter(next: XlvQualificationStatus | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("stock");
    if (!next) params.delete("status");
    else {
      params.set("status", next);
      params.delete("alert");
    }
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  function setAlertFilter(next: XlvAlertKind) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("stock");
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
        const json = await readResponseJson<ApiResponse & { error?: string }>(
          res,
          "加载设备"
        );
        if (!res.ok) throw new Error(json.error || "加载失败");
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(getFetchErrorMessage(err, "加载失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managerKey, staffKey]);

  const undeployedStock = data?.undeployedStock ?? [];
  const undeployedCount = undeployedStock.length;

  const allDevices = (data?.devices ?? []).map(mapDevice);
  const filtered = (data?.devices ?? []).filter((d) => {
    if (status === "qualified") return d.qualificationStatus === "qualified";
    if (status === "in_progress") return isXlvQualificationInProgressActive(d);
    if (alert !== "all") return xlvEffectiveAlertKind(d) === alert;
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
    in_progress: allDevices.filter((d) => isXlvQualificationInProgressActive(d))
      .length,
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
            const params = new URLSearchParams(searchParams.toString());
            params.delete("status");
            params.delete("alert");
            params.delete("stock");
            router.replace(`${pathname}?${params}`, { scroll: false });
          }}
          className={`${xlvFilterChipBaseClass()} ${xlvTabButtonClass(alert === "all" && !status && !stockUndeployed)}`}
        >
          <XlvFilterChipText label="全部" count={counts.all} active={alert === "all" && !status && !stockUndeployed} />
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
        {XLV_SLEEP_ALERT_FILTERS.map((item) => (
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
        <button
          type="button"
          onClick={() => setStockFilter(!stockUndeployed)}
          className={`${xlvFilterChipBaseClass()} ${
            stockUndeployed
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100"
          }`}
        >
          <XlvFilterChipText
            label="未铺设"
            count={`${undeployedCount} 台`}
            active={stockUndeployed}
          />
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#94a3b8] py-8 text-center">加载中…</p>
      ) : stockUndeployed ? (
        undeployedStock.length === 0 ? (
          <p className="text-sm text-[#94a3b8] py-8 text-center">
            暂无未铺设库存
          </p>
        ) : (
          <ul className="space-y-2">
            {undeployedStock.map((item) => (
              <li
                key={item.deviceSn}
                className="rounded-[12px] border border-[#eef2f7] bg-white px-4 py-3 text-sm"
              >
                <Link
                  href={xlvPath(`/devices/${encodeURIComponent(item.deviceSn)}`)}
                  className="font-mono text-[#2563eb] hover:text-[#1d4ed8] font-medium"
                >
                  {item.deviceSn}
                </Link>
                {item.channel ? (
                  <p className="text-xs text-[#94a3b8] mt-1">{item.channel}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <XlvDeviceCardList
          devices={devices}
          showManager={false}
          emptyText={isSelfView ? "暂无设备" : "该队员暂无设备"}
          linkToDetail
          showFollowUpStatus
          activeShortcut={status ?? (alert !== "all" ? alert : null)}
        />
      )}
    </PageShell>
  );
}
