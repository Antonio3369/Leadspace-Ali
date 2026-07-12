/** 全站统一核心指标名称 */
export const CORE_METRICS = {
  TOTAL_MERCHANTS: "累计拓展商户",
  PHOTO_PASS_RATE: "照片审核通过率",
  SALES_ACTIVATION_RATE: "整体动销通过率",
  RISK_COMPLIANCE_RATE: "当前风控达标率",
  RISK_UNDER_REVIEW: "风控审核中",
  RISK_REVIEW_ACTIVATED: "审核中已动销（可转化）",
  RISK_FAILED: "风控不通过",
  ESTIMATED_RISK_RATE: "预估风控达标率",
} as const;

/** 动销判定：15 天有效碰笔 + 扫码 ≥ 此值 */
export const SALES_ACTIVATION_TOUCH_SCAN_THRESHOLD = 2;

/** 动销判定：30 天有效交易笔数 ≥ 此值 */
export const SALES_ACTIVATION_TRANSACTION_THRESHOLD = 2;

/** 视觉配色规范 */
export const COLORS = {
  primary: "#165DFF",
  success: "#00B42A", // ≥70% 达标
  warning: "#FF7D00", // 60%-70%
  danger: "#F53F3F",  // <60%
  pageBg: "#F5F7FA",
  cardBg: "#FFFFFF",
} as const;

export const RATE_THRESHOLDS = {
  success: 70,
  warning: 60,
} as const;

export const ROLE_LABELS: Record<string, string> = {
  DIRECTOR: "事业部负责人",
  MANAGER: "区域经理",
  SUPERVISOR: "团队主管",
  SALES: "一线业务员",
};

export const LIFECYCLE_LABELS: Record<string, string> = {
  IMPORTED: "未开通",
  PENDING_ONBOARDING: "待认证",
  ACTIVE: "已激活",
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  DISABLED: "已停用",
  RESIGNED: "已离职",
};
