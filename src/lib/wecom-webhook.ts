/**
 * 企微群机器人 Webhook（markdown）。
 * 未配置 url 时静默跳过。
 */
export async function pushWeComWebhookMarkdown(
  url: string | null | undefined,
  content: string
): Promise<void> {
  const target = url?.trim();
  if (!target) return;

  const res = await fetch(target, {
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
