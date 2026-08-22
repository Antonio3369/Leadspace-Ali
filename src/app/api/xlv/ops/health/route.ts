import { NextResponse } from "next/server";
import { runXlvOpsHealthCheck } from "@/services/xlv/ops-health";

export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const secret = process.env.XLV_OPS_CRON_SECRET?.trim();
  if (!secret) return false;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret && querySecret === secret) return true;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  return false;
}

/** 运维巡检：卡死导入 / 内存过高 → 优先推个人企微应用 */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("test") === "1") {
    try {
      const { notifyXlvOutboundOpsAlert } = await import(
        "@/services/xlv/outbound-notifier"
      );
      await notifyXlvOutboundOpsAlert(
        "测试告警",
        "> LEADspace 运维通道已接通\n> 若你企微「LEADspace 运维」应用收到此消息，个人告警已生效"
      );
      return NextResponse.json({ ok: true, test: true });
    } catch (err) {
      console.error("[xlv-ops-health] test:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "test failed" },
        { status: 500 }
      );
    }
  }

  try {
    const result = await runXlvOpsHealthCheck();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (err) {
    console.error("[xlv-ops-health]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "health check failed" },
      { status: 500 }
    );
  }
}
