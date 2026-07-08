import type { CoreMetrics } from "@/services/stats/query";

export type AlertScope = "global" | "team" | "personal";

export interface AlertResult {
  visible: boolean;
  message: string;
}

/**
 * 自动生成预警文案
 * - 无待审核 → 隐藏
 * - 风控全部完成 → 显示完成文案
 * - 否则按 scope 生成对应文案
 */
export function generateRiskAlert(
  metrics: CoreMetrics,
  scope: AlertScope
): AlertResult {
  const { riskUnderReview, riskReviewActivated, estimatedRiskRate, riskComplianceRate } =
    metrics;

  if (riskUnderReview === 0) {
    if (metrics.totalMerchants > 0 && metrics.riskFailed + metrics.riskPassedCount === metrics.totalMerchants) {
      return {
        visible: true,
        message: `当前所有订单风控已完成，风控达标率为 ${riskComplianceRate.toFixed(1)}%`,
      };
    }
    return { visible: false, message: "" };
  }

  const rateText = estimatedRiskRate.toFixed(1);

  switch (scope) {
    case "global":
    case "team":
      if (scope === "team") {
        return {
          visible: true,
          message: `本组${riskUnderReview}笔待审核订单中${riskReviewActivated}笔已达标，小组风控达标率将上升至 ${rateText}%`,
        };
      }
      return {
        visible: true,
        message: `${riskUnderReview}笔待审核订单中${riskReviewActivated}笔已达标，全部通过后，风控达标率将上升至 ${rateText}%`,
      };
    case "personal":
      return {
        visible: true,
        message: `您${riskUnderReview}笔待审核订单中${riskReviewActivated}笔已达标，您个人风控达标率将上升至 ${rateText}%`,
      };
    default:
      return { visible: false, message: "" };
  }
}

export function resolveAlertScope(
  role: string,
  view?: "team" | "personal"
): AlertScope {
  if (role === "SUPERVISOR") {
    return view === "personal" ? "personal" : "team";
  }
  if (role === "SALES") return "personal";
  if (role === "MANAGER") return "team";
  return "global";
}
