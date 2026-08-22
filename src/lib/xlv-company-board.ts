/** 分公司看板 · 类型与常量（客户端可安全引用，勿 import db） */

import { isXlvPlaceholderName } from "@/lib/xlv-rules";

export const XLV_UNASSIGNED_COMPANY_KEY = "__unassigned__";
export const XLV_UNASSIGNED_COMPANY_LABEL = "未归属 / 待定";

export type XlvCompanyBoardRow = {
  key: string;
  name: string;
  deployedCount: number;
  monthExpandCount: number;
  inProgressCount: number;
  singleSilenceCount: number;
  dormantCount: number;
  compliantCount: number;
  complianceRate: number;
  monthWakeUpRate: number;
  monthFollowUpCount: number;
  monthWakeUpCount: number;
};

export type XlvCompanyBoardResult = {
  rows: XlvCompanyBoardRow[];
  summary: {
    companyCount: number;
    deployedCount: number;
    monthExpandCount: number;
    inProgressCount: number;
    singleSilenceCount: number;
    dormantCount: number;
    complianceRate: number;
    monthWakeUpRate: number;
    /** 数据日期：全库已铺设设备中最晚末笔交易日（lastTxnDate） */
    dataDate: string | null;
    unassignedDeployedCount: number;
    compliantCount: number;
  };
};

/** 列表末尾：未归属或占位公司名（不参与 1–N 排名） */
export function isXlvCompanyBoardTailRow(row: Pick<XlvCompanyBoardRow, "key">) {
  return (
    row.key === XLV_UNASSIGNED_COMPANY_KEY || isXlvPlaceholderName(row.key)
  );
}
