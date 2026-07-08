import { CORE_METRICS, COLORS } from "@/lib/constants";
import { getRateColorLevel } from "@/lib/business-rules";

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
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <p className="text-2xl font-semibold" style={{ color }}>
        {display}
        {suffix && <span className="text-base ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}

export function MetricsGrid({
  metrics,
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
}) {
  const items = [
    { label: CORE_METRICS.TOTAL_MERCHANTS, value: metrics.totalMerchants },
    { label: CORE_METRICS.PHOTO_PASS_RATE, value: metrics.photoPassRate, isRate: true, suffix: "%" },
    { label: CORE_METRICS.SALES_ACTIVATION_RATE, value: metrics.salesActivationRate, isRate: true, suffix: "%" },
    { label: CORE_METRICS.RISK_COMPLIANCE_RATE, value: metrics.riskComplianceRate, isRate: true, suffix: "%" },
    { label: CORE_METRICS.RISK_UNDER_REVIEW, value: metrics.riskUnderReview },
    { label: CORE_METRICS.RISK_REVIEW_ACTIVATED, value: metrics.riskReviewActivated },
    { label: CORE_METRICS.RISK_FAILED, value: metrics.riskFailed },
    { label: CORE_METRICS.ESTIMATED_RISK_RATE, value: metrics.estimatedRiskRate, isRate: true, suffix: "%" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <MetricCard
          key={item.label}
          label={item.label}
          value={item.value}
          isRate={item.isRate}
          suffix={item.suffix}
        />
      ))}
    </div>
  );
}
