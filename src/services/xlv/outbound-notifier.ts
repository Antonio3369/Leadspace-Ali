/**
 * 小绿盒外推：业务走企微群 Webhook；运维告警走运维小群（不进业务群）。
 * 旁路推送，失败只打日志，不挡站内通知 / 关单事务。
 */

import { pushWeComOpsAppMarkdown } from "@/lib/wecom-app-message";
import { pushWeComWebhookMarkdown } from "@/lib/wecom-webhook";
import { summarizeFollowUpResult } from "@/lib/xlv-follow-up";
import { xlvMerchantLabel } from "@/lib/xlv-rules";
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

export function buildXlvWithdrawPendingMarkdown(opts: {
  deviceSn: string;
  merchantName: string | null;
  storeName: string | null;
}): string {
  const store =
    opts.merchantName?.trim() ||
    opts.storeName?.trim() ||
    opts.deviceSn;
  const link = `${publicBaseUrl()}/xlv/notifications`;
  return [
    "**【小绿盒】撤机待确认**",
    `> SN：${opts.deviceSn}`,
    `> 门店：${store}`,
    `> 说明：运营已登记移机，请登录确认是否同意撤机`,
    `> [打开通知中心](${link})`,
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

export async function notifyXlvOutboundWithdrawPending(opts: {
  deviceSn: string;
  merchantName: string | null;
  storeName: string | null;
}): Promise<void> {
  const url = xlvOutboundWebhookUrl();
  if (!url) return;
  await pushWeComWebhookMarkdown(url, buildXlvWithdrawPendingMarkdown(opts));
}

export async function notifyXlvOutboundOpsAlert(
  title: string,
  detail: string
): Promise<void> {
  const content = buildXlvOpsAlertMarkdown(title, detail);

  // 1) 运维小群 Webhook（主体域名受限时的主通道）
  const opsUrl = opsAlertWebhookUrl();
  if (opsUrl) {
    await pushWeComWebhookMarkdown(opsUrl, content);
    return;
  }

  // 2) 可选：自建应用推个人（需企业可信 IP；域名主体校验失败时不可用）
  try {
    const sentToApp = await pushWeComOpsAppMarkdown(content);
    if (sentToApp) return;
  } catch (err) {
    console.error("[xlv-ops] wecom app message failed:", err);
  }
  // 故意不回退 XLV_OUTBOUND_WEBHOOK_URL，避免内存/宕机刷业务群
}

function summarizeXlvImportResult(result: unknown): string {
  if (!result || typeof result !== "object") return "已完成";
  const r = result as Record<string, unknown>;
  const format =
    r.format === "roster"
      ? "组织名册"
      : r.format === "raw"
        ? "原始明细"
        : String(r.format ?? "");
  return `${format} · ${r.totalRows ?? "?"} 行 · 设备新增 ${r.createdDevices ?? 0} / 更新 ${r.updatedDevices ?? 0}`;
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
  const link = `${publicBaseUrl()}/xlv/admin/import`;
  return [
    `**【小绿盒】数据上传成功${partialNote}**`,
    `> 文件：${opts.fileName}`,
    `> 上传人：${opts.uploadedByName}`,
    `> 结果：${summary}`,
    `> [打开导入页](${link})`,
  ].join("\n");
}

export async function notifyXlvOutboundImportSuccess(opts: {
  fileName: string;
  status: "SUCCESS" | "PARTIAL";
  uploadedByName: string;
  result: unknown;
}): Promise<void> {
  const url = xlvOutboundWebhookUrl();
  if (!url) return;
  await pushWeComWebhookMarkdown(url, buildXlvImportSuccessMarkdown(opts));
}
