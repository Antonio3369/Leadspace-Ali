import type { MerchantRecord } from "@/generated/prisma/client";
import {
  SALES_ACTIVATION_TOUCH_SCAN_THRESHOLD,
  SALES_ACTIVATION_TRANSACTION_THRESHOLD,
} from "@/lib/constants";

type SalesActivationInput = Pick<
  MerchantRecord,
  | "photoStatus"
  | "touchCount15d"
  | "scanCount15d"
  | "transactionCount30d"
  | "salesActivationStatus"
>;

type MerchantLike = SalesActivationInput &
  Pick<MerchantRecord, "riskStatus">;

/** 照片审核通过 */
export function isPhotoApproved(merchant: Pick<MerchantRecord, "photoStatus">): boolean {
  return merchant.photoStatus === "APPROVED";
}

/**
 * 动销判定标准：
 * 照片审核通过 +（15天有效碰笔数 + 15天有效扫码数 ≥ 2 或 30天有效交易笔数 ≥ 2）
 */
export function isSalesActivated(merchant: SalesActivationInput): boolean {
  if (!isPhotoApproved(merchant)) return false;
  const touchScanTotal = merchant.touchCount15d + merchant.scanCount15d;
  return (
    touchScanTotal >= SALES_ACTIVATION_TOUCH_SCAN_THRESHOLD ||
    merchant.transactionCount30d >= SALES_ACTIVATION_TRANSACTION_THRESHOLD
  );
}

/** 根据原始字段计算动销状态 */
export function computeSalesActivationStatus(
  merchant: SalesActivationInput
): "NOT_ACTIVATED" | "ACTIVATED" | "IN_PROGRESS" {
  if (isSalesActivated(merchant)) return "ACTIVATED";
  if (isPhotoApproved(merchant)) return "IN_PROGRESS";
  return "NOT_ACTIVATED";
}

/** 风控达标：已通过 */
export function isRiskPassed(merchant: Pick<MerchantRecord, "riskStatus">): boolean {
  return merchant.riskStatus === "PASSED";
}

/** 审核中且已动销（可转化） */
export function isRiskReviewActivated(merchant: MerchantLike): boolean {
  return merchant.riskStatus === "PENDING" && isSalesActivated(merchant);
}

/**
 * 预估风控达标率 = (当前风控通过数 + 审核中且已动销数) / 当期总商户数 × 100%
 */
export function calculateEstimatedRiskRate(
  totalMerchants: number,
  riskPassedCount: number,
  riskReviewActivatedCount: number
): number {
  if (totalMerchants === 0) return 0;
  return ((riskPassedCount + riskReviewActivatedCount) / totalMerchants) * 100;
}

/** 当前风控达标率 = 风控通过数 / 总商户数 × 100% */
export function calculateRiskComplianceRate(
  totalMerchants: number,
  riskPassedCount: number
): number {
  if (totalMerchants === 0) return 0;
  return (riskPassedCount / totalMerchants) * 100;
}

/** 动销未达标原因分类（用于饼图） */
export function classifySalesFailureReason(
  merchant: SalesActivationInput & Pick<MerchantRecord, "riskStatus" | "photoStatus">
): string {
  if (merchant.photoStatus === "REJECTED") return "照片未通过";
  if (merchant.riskStatus === "FAILED") return "风控不通过";
  if (isSalesActivated(merchant)) return "已动销";
  if (merchant.photoStatus !== "APPROVED") return "照片审核待定";
  const touchScan = merchant.touchCount15d + merchant.scanCount15d;
  if (touchScan < SALES_ACTIVATION_TOUCH_SCAN_THRESHOLD && merchant.transactionCount30d < SALES_ACTIVATION_TRANSACTION_THRESHOLD) {
    return "碰笔/扫码/交易未达标";
  }
  return "其他";
}

/** 根据百分比返回配色等级 */
export function getRateColorLevel(rate: number): "success" | "warning" | "danger" {
  if (rate >= 70) return "success";
  if (rate >= 60) return "warning";
  return "danger";
}
