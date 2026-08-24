import { db } from "@/lib/db";
import type { XlvRelocationHint } from "@/lib/xlv-relocation";

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

export async function attachXlvRelocations<
  T extends { deviceSn: string; relocation?: XlvRelocationHint | null },
>(items: T[]): Promise<T[]> {
  const map = await loadXlvRelocationsBySn(items.map((item) => item.deviceSn));
  for (const item of items) {
    item.relocation = map.get(item.deviceSn) ?? null;
  }
  return items;
}
