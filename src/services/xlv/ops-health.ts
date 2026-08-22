/**
 * 小绿盒运维巡检（供 cron 调用 /api/xlv/ops/health）。
 */

import { db } from "@/lib/db";
import { notifyXlvOutboundOpsAlert } from "./outbound-notifier";

const COOLDOWN_MS = 30 * 60 * 1000;
const MEM_WARN_RSS_MB = Number(process.env.XLV_OPS_MEM_WARN_MB ?? "1200");

const lastAlertAt = new Map<string, number>();

function shouldAlert(key: string): boolean {
  const now = Date.now();
  const last = lastAlertAt.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) return false;
  lastAlertAt.set(key, now);
  return true;
}

async function alert(key: string, title: string, detail: string) {
  if (!shouldAlert(key)) return;
  try {
    await notifyXlvOutboundOpsAlert(title, detail);
  } catch (err) {
    console.error("[xlv-ops-health] wecom alert failed:", err);
  }
}

export type XlvOpsHealthResult = {
  ok: boolean;
  checks: {
    memoryRssMb: number;
    memoryWarnMb: number;
    stuckImports: number;
  };
  warnings: string[];
};

export async function runXlvOpsHealthCheck(): Promise<XlvOpsHealthResult> {
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const warnings: string[] = [];

  const stuckImports = await db.heavyImportJob.count({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
    },
  });

  if (rssMb >= MEM_WARN_RSS_MB) {
    warnings.push(`memory_high:${rssMb}MB`);
    console.warn(
      `[xlv-ops-health] memory_high rss=${rssMb}MB threshold=${MEM_WARN_RSS_MB}MB`
    );
    // 推运维小群（不进业务群）
    await alert(
      "memory_high",
      "应用内存过高",
      `> RSS：${rssMb}MB（阈值 ${MEM_WARN_RSS_MB}MB）\n> 连续两次超阈值且无导入时将自动重启`
    );
  }

  if (stuckImports > 0) {
    warnings.push(`import_stuck:${stuckImports}`);
    await alert(
      "import_stuck",
      "导入可能卡死",
      `> 小绿盒导入 PROCESSING 超过 15 分钟：${stuckImports} 个\n> 建议：让用户重新上传；查 HeavyImportJob 表`
    );
  }

  return {
    ok: warnings.length === 0,
    checks: {
      memoryRssMb: rssMb,
      memoryWarnMb: MEM_WARN_RSS_MB,
      stuckImports,
    },
    warnings,
  };
}
