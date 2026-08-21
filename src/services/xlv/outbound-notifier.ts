/**
 * 小绿盒外推：企微群机器人 Webhook。
 * 旁路推送，失败只打日志，不挡站内通知 / 关单事务。
 */

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
  const url = xlvOutboundWebhookUrl();
  if (!url) return;
  await pushWeComWebhookMarkdown(url, buildXlvOpsAlertMarkdown(title, detail));
}
