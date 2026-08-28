/**
 * 小绿盒外推：运维小群收告警与导入结果；负责人群收分公司汇总。
 * 旁路推送，失败只打日志，不挡站内通知 / 关单事务。
 */

import { pushWeComOpsAppMarkdown } from "@/lib/wecom-app-message";
import { pushWeComWebhookMarkdown } from "@/lib/wecom-webhook";
import {
  isXlvCompanyBoardTailRow,
  type XlvCompanyBoardResult,
} from "@/lib/xlv-company-board";
import { summarizeFollowUpResult } from "@/lib/xlv-follow-up";
import { XLV_COMPLIANCE_TARGET_RATE, xlvMerchantLabel } from "@/lib/xlv-rules";
import { getXlvCompanyBoard } from "./company-board";
import type { XlvFollowUpNotificationPayload } from "./notifications";

function publicBaseUrl(): string {
  const fromEnv =
    process.env.XLV_PUBLIC_BASE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "";
  return (fromEnv || "https://ali.orblead.com").replace(/\/$/, "");
}

export function xlvOutboundWebhookUrl(): string | null {
  return process.env.XLV_OUTBOUND_WEBHOOK_URL?.trim() || null;
}

/** 运维紧急告警专用；勿回退到业务群 Webhook */
export function opsAlertWebhookUrl(): string | null {
  return process.env.OPS_ALERT_WEBHOOK_URL?.trim() || null;
}

export function buildXlvFollowUpDoneMarkdown(
  payload: XlvFollowUpNotificationPayload
): string {
  const store =
    xlvMerchantLabel({
      merchantName: payload.merchantName,
      activationMerchantName: payload.activationMerchantName,
    }) || payload.deviceSn;
  const summary = summarizeFollowUpResult({
    connectStatus: payload.connectStatus,
    flags: payload.flags,
    photoCount: payload.photoUrls.length,
  });
  const link = `${publicBaseUrl()}/xlv/devices/${encodeURIComponent(payload.deviceSn)}`;
  return [
    "**【小绿盒】队员已跟进**",
    `> 处理人：${payload.followUpByName || payload.operatorName}`,
    `> 门店：${store}`,
    `> 结果：${summary}`,
    `> [打开设备详情](${link})`,
  ].join("\n");
}

export function buildXlvOpsAlertMarkdown(title: string, detail: string): string {
  return [
    `**【小绿盒 · 运维】${title}**`,
    `> 时间：${new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}`,
    detail,
    `> 站点：${publicBaseUrl()}`,
  ].join("\n");
}

export async function notifyXlvOutboundFollowUpDone(
  payload: XlvFollowUpNotificationPayload
): Promise<void> {
  const url = xlvOutboundWebhookUrl();
  if (!url) return;
  await pushWeComWebhookMarkdown(url, buildXlvFollowUpDoneMarkdown(payload));
}

/** 运维小群；不回退业务群 Webhook */
async function pushXlvOpsMarkdown(content: string): Promise<void> {
  const opsUrl = opsAlertWebhookUrl();
  if (opsUrl) {
    await pushWeComWebhookMarkdown(opsUrl, content);
    return;
  }

  try {
    const sentToApp = await pushWeComOpsAppMarkdown(content);
    if (sentToApp) return;
  } catch (err) {
    console.error("[xlv-ops] wecom app message failed:", err);
  }
}

export async function notifyXlvOutboundOpsAlert(
  title: string,
  detail: string
): Promise<void> {
  await pushXlvOpsMarkdown(buildXlvOpsAlertMarkdown(title, detail));
}

function summarizeXlvImportResult(result: unknown): string {
  if (!result || typeof result !== "object") return "已完成";
  const r = result as Record<string, unknown>;
  const summary =
    r.summary && typeof r.summary === "object"
      ? (r.summary as Record<string, unknown>)
      : {};
  const rows = r.importedRows ?? r.totalRows ?? "?";
  if (r.format === "roster") {
    return `组织名册 · ${rows} 行 · 新建 ${summary.rosterCreated ?? 0} / 更新 ${summary.rosterUpdated ?? 0}`;
  }
  if (r.format === "assignment") {
    return `SN归属 · ${rows} 行 · 设备新增 ${r.createdDevices ?? 0} / 更新 ${r.updatedDevices ?? 0}`;
  }
  if (r.format === "raw") {
    return `运营原始表 · ${rows} 行 · 设备新增 ${r.createdDevices ?? 0} / 更新 ${r.updatedDevices ?? 0}`;
  }
  return `已完成 · ${rows} 行`;
}

export function buildXlvImportSuccessMarkdown(opts: {
  fileName: string;
  status: "SUCCESS" | "PARTIAL";
  uploadedByName: string;
  result: unknown;
}): string {
  const partialNote =
    opts.status === "PARTIAL" ? "（部分成功，请登录核对明细）" : "";
  const summary = summarizeXlvImportResult(opts.result);
  const resultObj =
    opts.result && typeof opts.result === "object"
      ? (opts.result as { format?: string })
      : {};
  const nextStep =
    opts.status === "SUCCESS" && resultObj.format === "roster"
      ? "请到人员归属核对点击「从名册同步」"
      : "";
  const link = `${publicBaseUrl()}/xlv/admin/import`;
  return [
    `**【小绿盒 · 运维】数据上传成功${partialNote}**`,
    `> 时间：${new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}`,
    `> 文件：${opts.fileName}`,
    `> 上传人：${opts.uploadedByName}`,
    `> 结果：${summary}`,
    ...(nextStep ? [`> 下一步：${nextStep}`] : []),
    `> [打开导入页](${link})`,
  ].join("\n");
}

export async function notifyXlvOutboundImportSuccess(opts: {
  fileName: string;
  status: "SUCCESS" | "PARTIAL";
  uploadedByName: string;
  result: unknown;
}): Promise<void> {
  await pushXlvOpsMarkdown(buildXlvImportSuccessMarkdown(opts));
}

export function buildXlvImportFailedMarkdown(opts: {
  fileName: string;
  uploadedByName: string;
  errorMessage: string;
}): string {
  const reason = opts.errorMessage.trim() || "导入失败";
  const link = `${publicBaseUrl()}/xlv/admin/import`;
  return [
    "**【小绿盒 · 运维】数据上传失败**",
    `> 时间：${new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}`,
    `> 文件：${opts.fileName}`,
    `> 上传人：${opts.uploadedByName}`,
    `> 原因：${reason}`,
    `> 请重新上传。 [打开导入页](${link})`,
  ].join("\n");
}

export async function notifyXlvOutboundImportFailed(opts: {
  fileName: string;
  uploadedByName: string;
  errorMessage: string;
}): Promise<void> {
  await pushXlvOpsMarkdown(buildXlvImportFailedMarkdown(opts));
}

function companyBoardRankPrefix(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}.`;
}

function pctOne(v: number) {
  return `${v.toFixed(1)}%`;
}

/** 负责人群 · 分公司排名汇总（不含未归属/待定） */
export function buildXlvCompanyBoardSummaryMarkdown(
  board: XlvCompanyBoardResult
): string {
  const { summary, rows } = board;
  const companies = rows.filter((r) => !isXlvCompanyBoardTailRow(r));
  const link = `${publicBaseUrl()}/xlv/admin/companies`;
  const dateLine = summary.dataDate
    ? `数据日期 ${summary.dataDate}`
    : "数据日期 —";

  const companyLines = companies.map((row, index) => {
    const rank = index + 1;
    return `${companyBoardRankPrefix(rank)} **${row.name}** · 已铺 ${row.deployedCount} · 沉睡 ${row.dormantCount} · 单笔沉默 ${row.singleSilenceCount} · 合规 ${pctOne(row.complianceRate)} · 唤醒 ${pctOne(row.monthWakeUpRate)}`;
  });

  return [
    "**【小绿盒】分公司排名汇总**",
    `> ${dateLine} · 已铺设 ${summary.deployedCount} · 合规 ${pctOne(summary.complianceRate)}（目标 ${XLV_COMPLIANCE_TARGET_RATE}%）`,
    "",
    ...companyLines.map((line) => `> ${line}`),
    "",
    `> [打开分公司看板](${link})`,
  ].join("\n");
}

/** 负责人群 · SN 归属表导入成功后推送（不含未归属/待定） */
export async function notifyXlvOutboundCompanyBoardSummary(): Promise<void> {
  const url = xlvOutboundWebhookUrl();
  if (!url) return;
  const board = await getXlvCompanyBoard();
  await pushWeComWebhookMarkdown(
    url,
    buildXlvCompanyBoardSummaryMarkdown(board)
  );
}
