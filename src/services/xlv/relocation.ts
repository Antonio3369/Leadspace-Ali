import { db } from "@/lib/db";
import type { XlvRelocationHint } from "@/lib/xlv-relocation";
import { normalizeXlvStatDate } from "@/lib/xlv-stat-date";

function readRelocationMeta(meta: unknown): XlvRelocationHint | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const fromStore = typeof m.fromStore === "string" ? m.fromStore.trim() : "";
  const toStore = typeof m.toStore === "string" ? m.toStore.trim() : "";
  if (!fromStore) return null;
  return { fromStore, toStore };
}

export async function loadXlvRelocationsBySn(
  deviceSns: string[]
): Promise<Map<string, XlvRelocationHint>> {
  const sns = [...new Set(deviceSns.map((sn) => sn.trim()).filter(Boolean))];
  const map = new Map<string, XlvRelocationHint>();
  if (sns.length === 0) return map;

  const rows = await db.xlvInventoryTransfer.findMany({
    where: {
      deviceSn: { in: sns },
      transferType: "deploy",
      note: { startsWith: "SN归属换商铺设" },
    },
    orderBy: { createdAt: "desc" },
    select: { deviceSn: true, meta: true },
  });

  for (const row of rows) {
    if (map.has(row.deviceSn)) continue;
    const hint = readRelocationMeta(row.meta);
    if (hint) map.set(row.deviceSn, hint);
  }

  return map;
}

export async function backfillXlvRelocatedAtFromTransfers() {
  const rows = await db.xlvInventoryTransfer.findMany({
    where: {
      transferType: "deploy",
      note: { startsWith: "SN归属换商铺设" },
    },
    orderBy: { createdAt: "asc" },
    select: { deviceSn: true, createdAt: true, meta: true },
  });

  const latest = new Map<string, Date>();
  for (const row of rows) {
    if (!readRelocationMeta(row.meta)) continue;
    latest.set(row.deviceSn, normalizeXlvStatDate(row.createdAt));
  }

  const sns = [...latest.keys()];
  for (const deviceSn of sns) {
    const relocatedAt = latest.get(deviceSn)!;
    await db.xlvDeviceRecord.updateMany({
      where: { deviceSn, relocatedAt: null },
      data: { relocatedAt },
    });
  }

  return { scanned: rows.length, devices: sns.length, deviceSns: sns };
}

export async function attachXlvRelocations<
  T extends { deviceSn: string; relocation?: XlvRelocationHint | null },
>(items: T[]): Promise<T[]> {
  const map = await loadXlvRelocationsBySn(items.map((item) => item.deviceSn));
  for (const item of items) {
    item.relocation = map.get(item.deviceSn) ?? null;
  }
  return items;
}
