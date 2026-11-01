/**
 * 小绿盒运维巡检（供 cron 调用 /api/xlv/ops/health）。
 */

import { db } from "@/lib/db";
import { notifyXlvOutboundOpsAlert } from "./outbound-notifier";

const COOLDOWN_MS = 30 * 60 * 1000;
/** 告警线。须高于日常看板峰值，且不要低于 Node 堆上限，否则堆一顶满就误报 */
const MEM_WARN_RSS_MB = Number(process.env.XLV_OPS_MEM_WARN_MB ?? "1600");
/** 自动重启线。须低于容器 2G，并高于 --max-old-space-size=1536，避免堆用满就踢人 */
const MEM_RESTART_RSS_MB = Number(process.env.XLV_OPS_MEM_RESTART_MB ?? "1850");

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
    memoryRestartMb: number;
    stuckImports: number;
  };
  warnings: string[];
};

function currentRssMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

export async function runXlvOpsHealthCheck(): Promise<XlvOpsHealthResult> {
  let rssMb = currentRssMb();
  const warnings: string[] = [];

  const stuckImports = await db.heavyImportJob.count({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
    },
  });

  if (rssMb >= MEM_WARN_RSS_MB && typeof global.gc === "function") {
    global.gc();
    rssMb = currentRssMb();
  }

  if (rssMb >= MEM_RESTART_RSS_MB) {
    warnings.push(`memory_critical:${rssMb}MB`);
    console.warn(
      `[xlv-ops-health] memory_critical rss=${rssMb}MB restart=${MEM_RESTART_RSS_MB}MB`
    );
    await alert(
      "memory_critical",
      "应用内存接近上限",
      `> RSS：${rssMb}MB（重启线 ${MEM_RESTART_RSS_MB}MB，告警线 ${MEM_WARN_RSS_MB}MB）\n> 连续两次仍高且无导入时将自动重启，避免顶到 2G 被系统杀掉`
    );
  } else if (rssMb >= MEM_WARN_RSS_MB) {
    warnings.push(`memory_high:${rssMb}MB`);
    console.warn(
      `[xlv-ops-health] memory_high rss=${rssMb}MB warn=${MEM_WARN_RSS_MB}MB`
    );
    await alert(
      "memory_high",
      "应用内存偏高",
      `> RSS：${rssMb}MB（告警线 ${MEM_WARN_RSS_MB}MB）\n> 未到重启线 ${MEM_RESTART_RSS_MB}MB，只告警不重启；凌晨 03:00 仍会常规回收`
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

  const fatal = stuckImports > 0 || warnings.some((w) => w.startsWith("memory_critical:"));
  return {
    ok: !fatal,
    checks: {
      memoryRssMb: rssMb,
      memoryWarnMb: MEM_WARN_RSS_MB,
      memoryRestartMb: MEM_RESTART_RSS_MB,
      stuckImports,
    },
    warnings,
  };
}
