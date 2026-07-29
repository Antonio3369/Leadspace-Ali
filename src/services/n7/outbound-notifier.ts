/**
 * N7 外推（MVP-A）：企微群机器人 Webhook。
 * 失败只抛错给调用方打日志，不参与关单事务。
 */

function publicBaseUrl(): string {
  const fromEnv =
    process.env.N7_PUBLIC_BASE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "";
  return (fromEnv || "https://ali.orblead.com").replace(/\/$/, "");
}

function webhookUrl(): string | null {
  const url = process.env.N7_OUTBOUND_WEBHOOK_URL?.trim();
  return url || null;
}

export type OutboundFollowUpDonePayload = {
  deviceSn: string;
  storeName: string | null;
  operatorName: string;
  followUpByName: string;
  summary: string;
};

/** 组装外推正文（企微 markdown） */
export function buildFollowUpDoneOutboundMarkdown(
  payload: OutboundFollowUpDonePayload
): string {
  const store = payload.storeName?.trim() || payload.deviceSn;
  const link = `${publicBaseUrl()}/n7/devices/${encodeURIComponent(payload.deviceSn)}`;
  return [
    `**【N7】队员已处理**`,
    `> 处理人：${payload.followUpByName || payload.operatorName}`,
    `> 门店：${store}`,
    `> 结果：${payload.summary}`,
    `> [打开设备详情](${link})`,
  ].join("\n");
}

/**
 * 推送到企微群 Webhook。未配置 URL 时静默跳过。
 * @throws 网络/企微返回错误时抛出（调用方须 catch）
 */
export async function pushWeComWebhookMarkdown(content: string): Promise<void> {
  const url = webhookUrl();
  if (!url) return;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { content },
    }),
  });

  const text = await res.text();
  let errcode = 0;
  let errmsg = "";
  try {
    const json = JSON.parse(text) as { errcode?: number; errmsg?: string };
    errcode = Number(json.errcode ?? 0);
    errmsg = String(json.errmsg ?? "");
  } catch {
    // 非 JSON
  }

  if (!res.ok || errcode !== 0) {
    throw new Error(
      `wecom webhook failed: http=${res.status} errcode=${errcode} errmsg=${errmsg || text.slice(0, 200)}`
    );
  }
}

export async function notifyOutboundFollowUpDone(
  payload: OutboundFollowUpDonePayload
): Promise<void> {
  if (!webhookUrl()) return;
  const content = buildFollowUpDoneOutboundMarkdown(payload);
  await pushWeComWebhookMarkdown(content);
}
