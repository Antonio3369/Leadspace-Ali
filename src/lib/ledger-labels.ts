import {
  SALES_ACTIVATION_TOUCH_SCAN_THRESHOLD,
  SALES_ACTIVATION_TRANSACTION_THRESHOLD,
} from "@/lib/constants";

export const PHOTO_LABELS: Record<string, string> = {
  PENDING: "待定",
  APPROVED: "通过",
  REJECTED: "不通过",
};

export const RISK_LABELS: Record<string, string> = {
  PENDING: "审核中",
  PASSED: "通过",
  FAILED: "不通过",
};

/** 动销进度（与 business-rules.computeSalesActivationStatus 一致） */
export const SALES_LABELS: Record<string, string> = {
  NOT_ACTIVATED: "未动销",
  IN_PROGRESS: "待动销达标",
  ACTIVATED: "已动销",
};

/** 表格「动销进度」列副标题 */
export const SALES_STATUS_DETAILS: Record<string, string> = {
  NOT_ACTIVATED: "照片未通过，动销尚未启动",
  IN_PROGRESS: "照片已通过，有效笔数不够",
  ACTIVATED: "照片已通过，有效笔数已达标",
};

export const SALES_ACTIVATION_CRITERIA = `动销达标：15 天碰笔 + 扫码 ≥ ${SALES_ACTIVATION_TOUCH_SCAN_THRESHOLD}，或 30 天交易 ≥ ${SALES_ACTIVATION_TRANSACTION_THRESHOLD}`;

export const RISK_FILTER_OPTIONS = [
  { value: "PENDING", label: "审核中", description: "风控审核中" },
  { value: "PASSED", label: "通过", description: "风控已通过" },
  { value: "FAILED", label: "不通过", description: "风控未通过" },
] as const;

export const PHOTO_FILTER_OPTIONS = [
  { value: "PENDING", label: "待定", description: "照片审核中" },
  { value: "APPROVED", label: "通过", description: "照片已通过" },
  { value: "REJECTED", label: "不通过", description: "照片未通过" },
] as const;

export const SALES_FILTER_OPTIONS = [
  {
    value: "NOT_ACTIVATED",
    label: SALES_LABELS.NOT_ACTIVATED!,
    description: SALES_STATUS_DETAILS.NOT_ACTIVATED!,
  },
  {
    value: "IN_PROGRESS",
    label: SALES_LABELS.IN_PROGRESS!,
    description: SALES_STATUS_DETAILS.IN_PROGRESS!,
  },
  {
    value: "ACTIVATED",
    label: SALES_LABELS.ACTIVATED!,
    description: SALES_STATUS_DETAILS.ACTIVATED!,
  },
] as const;

/** 台账页状态说明：三个独立维度 */
export const LEDGER_STATUS_LEGEND = {
  title: "三个状态怎么读？",
  subtitle: "风控 → 照片 → 动销，按顺序看，也可分别筛选",
  dimensions: [
    {
      name: "风控状态",
      hint: "支付宝风控审核结果",
      options: [
        { label: "审核中", detail: "风控待审" },
        { label: "通过", detail: "风控已通过" },
        { label: "不通过", detail: "风控未通过" },
      ],
    },
    {
      name: "照片状态",
      hint: "作业照片审核结果",
      options: [
        { label: "待定", detail: "照片审核中" },
        { label: "通过", detail: "照片已通过" },
        { label: "不通过", detail: "照片未通过" },
      ],
    },
    {
      name: "动销进度",
      hint: "照片通过后才看笔数",
      options: [
        { label: "未动销", detail: "照片未通过，动销未启动" },
        { label: "待动销达标", detail: "照片已通过，笔数不够" },
        { label: "已动销", detail: "照片已通过，笔数已达标" },
      ],
    },
  ],
  criteria: SALES_ACTIVATION_CRITERIA,
} as const;

/** @deprecated 使用 LEDGER_STATUS_LEGEND */
export const SALES_STATUS_LEGEND = LEDGER_STATUS_LEGEND;

export type LedgerStatusTone = "success" | "warning" | "danger" | "neutral";

export function photoStatusTone(status: string): LedgerStatusTone {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  return "warning";
}

export function riskStatusTone(status: string): LedgerStatusTone {
  if (status === "PASSED") return "success";
  if (status === "FAILED") return "danger";
  return "warning";
}

export function salesStatusTone(status: string): LedgerStatusTone {
  if (status === "ACTIVATED") return "success";
  if (status === "IN_PROGRESS") return "warning";
  return "neutral";
}

export const LEDGER_STATUS_TONE_CLASS: Record<LedgerStatusTone, string> = {
  success: "text-green-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  neutral: "text-gray-500",
};

export const LEDGER_QUICK_FILTERS = [
  {
    key: "riskReviewActivated",
    label: "审核中已动销",
    filters: { riskStatus: "PENDING", photoStatus: "", salesStatus: "ACTIVATED" },
  },
  {
    key: "riskPendingNotActivated",
    label: "审核中未动销",
    filters: {
      riskStatus: "PENDING",
      photoStatus: "",
      salesStatus: "IN_PROGRESS,NOT_ACTIVATED",
    },
  },
  {
    key: "salesPending",
    label: "待动销达标",
    filters: { riskStatus: "", photoStatus: "APPROVED", salesStatus: "IN_PROGRESS" },
  },
  {
    key: "riskFailed",
    label: "风控不通过",
    filters: { riskStatus: "FAILED", photoStatus: "", salesStatus: "" },
  },
  {
    key: "riskPending",
    label: "风控审核中",
    filters: { riskStatus: "PENDING", photoStatus: "", salesStatus: "" },
  },
] as const;
