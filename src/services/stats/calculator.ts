import {
  calculateEstimatedRiskRate,
  calculateRiskComplianceRate,
  isPhotoApproved,
  isRiskPassed,
  isRiskReviewActivated,
  isSalesActivated,
} from "@/lib/business-rules";
import type { PhotoStatus, RiskStatus, SalesActivationStatus } from "@/generated/prisma/client";
import type { CoreMetrics } from "@/services/stats/query";

type MerchantStatsRow = {
  photoStatus: PhotoStatus;
  riskStatus: RiskStatus;
  salesActivationStatus: SalesActivationStatus;
  touchCount15d: number;
  scanCount15d: number;
  transactionCount30d: number;
};

/**
 * 统一指标计算引擎
 * 适用场景：全局 / 团队 / 个人 / 单商机（传入已过滤的商户列表即可）
 */
export function calculateCoreMetrics(
  merchants: MerchantStatsRow[]
): CoreMetrics {
  const totalMerchants = merchants.length;

  const photoApprovedCount = merchants.filter(isPhotoApproved).length;
  const photoPassRate =
    totalMerchants === 0 ? 0 : (photoApprovedCount / totalMerchants) * 100;

  const salesActivatedCount = merchants.filter(isSalesActivated).length;
  const salesActivationRate =
    totalMerchants === 0 ? 0 : (salesActivatedCount / totalMerchants) * 100;

  const riskPassedCount = merchants.filter(isRiskPassed).length;
  const riskComplianceRate = calculateRiskComplianceRate(
    totalMerchants,
    riskPassedCount
  );

  const riskUnderReview = merchants.filter((m) => m.riskStatus === "PENDING").length;
  const riskReviewActivated = merchants.filter(isRiskReviewActivated).length;
  const riskFailed = merchants.filter((m) => m.riskStatus === "FAILED").length;

  const estimatedRiskRate = calculateEstimatedRiskRate(
    totalMerchants,
    riskPassedCount,
    riskReviewActivated
  );

  return {
    totalMerchants,
    photoPassRate,
    salesActivationRate,
    riskComplianceRate,
    riskUnderReview,
    riskReviewActivated,
    riskFailed,
    estimatedRiskRate,
    photoApprovedCount,
    photoTotalCount: totalMerchants,
    salesActivatedCount,
    riskPassedCount,
  };
}
