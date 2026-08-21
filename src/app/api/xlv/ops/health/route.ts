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

/** 运维巡检：内存 / 卡死导入 → 企微告警（须配置 XLV_OPS_CRON_SECRET） */
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
        "> 小绿盒企微通道已接通\n> 若群里有此消息，紧急通知已生效"
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
