/**
 * 企微自建应用 · 应用消息（推到指定成员 userid）。
 * 未配齐 WECOM_CORP_ID / AGENT_ID / AGENT_SECRET / OPS_USERID 时静默跳过。
 */

type TokenCache = { token: string; expiresAtMs: number };

let tokenCache: TokenCache | null = null;

export type WeComAppMessageConfig = {
  corpId: string;
  agentId: number;
  agentSecret: string;
  toUserId: string;
};

export function readWeComOpsAppConfig(): WeComAppMessageConfig | null {
  const corpId = process.env.WECOM_CORP_ID?.trim() || "";
  const agentSecret = process.env.WECOM_AGENT_SECRET?.trim() || "";
  const toUserId = process.env.WECOM_OPS_USERID?.trim() || "";
  const agentIdRaw = process.env.WECOM_AGENT_ID?.trim() || "";
  const agentId = Number(agentIdRaw);
  if (!corpId || !agentSecret || !toUserId || !Number.isFinite(agentId) || agentId <= 0) {
    return null;
  }
  return { corpId, agentId, agentSecret, toUserId };
}

async function getAccessToken(cfg: WeComAppMessageConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.token;
  }

  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
  url.searchParams.set("corpid", cfg.corpId);
  url.searchParams.set("corpsecret", cfg.agentSecret);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const json = (await res.json()) as {
    errcode?: number;
    errmsg?: string;
    access_token?: string;
    expires_in?: number;
  };

  if (!res.ok || json.errcode || !json.access_token) {
    throw new Error(
      `wecom gettoken failed: http=${res.status} errcode=${json.errcode ?? "?"} errmsg=${json.errmsg ?? ""}`
    );
  }

  const expiresInSec = Number(json.expires_in ?? 7200);
  tokenCache = {
    token: json.access_token,
    expiresAtMs: now + Math.max(60, expiresInSec - 120) * 1000,
  };
  return json.access_token;
}

/** 向运维负责人推送 markdown 应用消息（个人工作台可见） */
export async function pushWeComOpsAppMarkdown(content: string): Promise<boolean> {
  const cfg = readWeComOpsAppConfig();
  if (!cfg) return false;

  const token = await getAccessToken(cfg);
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: cfg.toUserId,
        msgtype: "markdown",
        agentid: cfg.agentId,
        markdown: { content },
        enable_duplicate_check: 1,
        duplicate_check_interval: 1800,
      }),
    }
  );

  const text = await res.text();
  let errcode = 0;
  let errmsg = "";
  try {
    const json = JSON.parse(text) as { errcode?: number; errmsg?: string };
    errcode = Number(json.errcode ?? 0);
    errmsg = String(json.errmsg ?? "");
  } catch {
    // non-json
  }

  if (!res.ok || errcode !== 0) {
    throw new Error(
      `wecom app message failed: http=${res.status} errcode=${errcode} errmsg=${errmsg || text.slice(0, 200)}`
    );
  }
  return true;
}
