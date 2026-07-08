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
  /** 照片未通过/待定，动销流程尚未启动 */
  NOT_ACTIVATED: "待照片通过",
  /** 照片已通过，碰笔/扫码/交易笔数未达标 */
  IN_PROGRESS: "待动销达标",
  ACTIVATED: "已动销",
};

export const SALES_FILTER_OPTIONS = [
  { value: "NOT_ACTIVATED", label: SALES_LABELS.NOT_ACTIVATED! },
  { value: "IN_PROGRESS", label: SALES_LABELS.IN_PROGRESS! },
  { value: "ACTIVATED", label: SALES_LABELS.ACTIVATED! },
] as const;

export const SALES_STATUS_HINT =
  "动销以照片审核通过为前提：照片待定或不通过为「待照片通过」；照片通过后笔数未达标为「待动销达标」。";
