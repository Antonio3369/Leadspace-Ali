import Link from "next/link";
import { CORE_METRICS, COLORS } from "@/lib/constants";
import { getRateColorLevel } from "@/lib/business-rules";
import type { LedgerDatePreset } from "@/lib/ledger-date";
import { buildMetricLedgerHref } from "@/lib/ledger-url";
import { NotionStatCard, NotionStatGrid } from "@/components/ui/notion";

interface MetricCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  isRate?: boolean;
}

function getRateStyle(rate: number) {
  const level = getRateColorLevel(rate);
  if (level === "success") return COLORS.success;
  if (level === "warning") return COLORS.warning;
  return COLORS.danger;
}

export function MetricCard({ label, value, suffix = "", isRate = false }: MetricCardProps) {
  const numValue = typeof value === "number" ? value : parseFloat(String(value));
  const color = isRate && !Number.isNaN(numValue) ? getRateStyle(numValue) : COLORS.primary;
  const display =
    typeof value === "number"
      ? isRate
        ? value.toFixed(1)
        : value.toLocaleString()
      : value;

  return (
    <div className="flex flex-col gap-1 p-3.5 sm:p-4 border border-[#eef2f7] rounded-[14px] bg-white">
      <p className="text-[0.82rem] text-[#64748b]">{label}</p>
      <p className="text-[1.35rem] sm:text-[1.6rem] font-bold leading-tight tabular-nums" style={{ color }}>
        {display}
        {suffix && <span className="text-base ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}

export type MetricsGridLedgerContext = {
  dateFrom?: string;
  dateTo?: string;
  datePreset?: LedgerDatePreset;
  managerId?: string;
  salesUserId?: string;
  opportunityId?: string;
};

export function MetricsGrid({
  metrics,
  ledgerContext,
}: {
  metrics: {
    totalMerchants: number;
    photoPassRate: number;
    salesActivationRate: number;
    riskComplianceRate: number;
    riskUnderReview: number;
    riskReviewActivated: number;
    riskFailed: number;
    estimatedRiskRate: number;
  };
  ledgerContext?: MetricsGridLedgerContext;
}) {
  const p0Href = buildMetricLedgerHref("riskReviewActivated", ledgerContext);
  const p1Href = buildMetricLedgerHref("salesPending", ledgerContext);
  const p2Href = buildMetricLedgerHref("riskPendingNotActivated", ledgerContext);
  const riskPendingHref = buildMetricLedgerHref("riskPending", ledgerContext);
  const riskFailedHref = buildMetricLedgerHref("riskFailed", ledgerContext);
  const p2Count = Math.max(0, metrics.riskUnderReview - metrics.riskReviewActivated);

  const items = [
    { label: CORE_METRICS.TOTAL_MERCHANTS, value: metrics.totalMerchants },
    { label: CORE_METRICS.PHOTO_PASS_RATE, value: metrics.photoPassRate, isRate: true, suffix: "%" },
    {
      label: CORE_METRICS.SALES_ACTIVATION_RATE,
      value: metrics.salesActivationRate,
      isRate: true,
      suffix: "%",
      href: p1Href,
    },
    { label: CORE_METRICS.RISK_COMPLIANCE_RATE, value: metrics.riskComplianceRate, isRate: true, suffix: "%" },
    {
      label: CORE_METRICS.RISK_UNDER_REVIEW,
      value: metrics.riskUnderReview,
      href: riskPendingHref,
    },
    {
      label: CORE_METRICS.RISK_REVIEW_ACTIVATED,
      value: metrics.riskReviewActivated,
      href: p0Href,
    },
    {
      label: CORE_METRICS.RISK_FAILED,
      value: metrics.riskFailed,
      href: riskFailedHref,
    },
    { label: CORE_METRICS.ESTIMATED_RISK_RATE, value: metrics.estimatedRiskRate, isRate: true, suffix: "%" },
  ];

  return (
    <div className="space-y-3">
      <NotionStatGrid>
        {items.map((item) => (
          <NotionStatCard
            key={item.label}
            label={item.label}
            value={item.value}
            isRate={item.isRate}
            suffix={item.suffix}
            href={item.href}
          />
        ))}
      </NotionStatGrid>
      {p2Count > 0 && (
        <p className="text-sm text-[#64748b]">
          审核中未动销{" "}
          <Link
            href={p2Href}
            className="font-medium text-[#2563eb] hover:text-[#1d4ed8] tabular-nums"
          >
            {p2Count.toLocaleString()}
          </Link>
          {" · "}
          <Link href={p1Href} className="text-[#2563eb] hover:text-[#1d4ed8]">
            待动销达标
          </Link>
        </p>
      )}
    </div>
  );
}
