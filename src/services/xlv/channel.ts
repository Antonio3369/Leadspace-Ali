import { db } from "@/lib/db";
import {
  xlvChannelDisplay,
  xlvChannelLabel,
  type XlvChannelLabel,
} from "@/lib/xlv-channel";

const LOOKUP_CHUNK = 500;

/** 运营原表导入后写入渠道；已有值会被本次文件名覆盖 */
export async function stampXlvDeviceChannel(
  deviceSns: string[],
  channel: XlvChannelLabel
) {
  const unique = [...new Set(deviceSns.filter(Boolean))];
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + LOOKUP_CHUNK);
    await db.xlvDeviceRecord.updateMany({
      where: { deviceSn: { in: chunk } },
      data: { channel },
    });
    await db.xlvInventoryDevice.updateMany({
      where: { deviceSn: { in: chunk } },
      data: { channel },
    });
  }
}

/** 设备上的渠道优先，没有再看库存账 */
export async function attachXlvChannels<T extends { deviceSn: string }>(
  items: T[]
): Promise<void> {
  if (items.length === 0) return;
  const sns = [...new Set(items.map((item) => item.deviceSn))];
  const bySn = new Map<string, string | null>();

  for (let i = 0; i < sns.length; i += LOOKUP_CHUNK) {
    const chunk = sns.slice(i, i + LOOKUP_CHUNK);
    const [devices, inventory] = await Promise.all([
      db.xlvDeviceRecord.findMany({
        where: { deviceSn: { in: chunk } },
        select: { deviceSn: true, channel: true },
      }),
      db.xlvInventoryDevice.findMany({
        where: { deviceSn: { in: chunk } },
        select: { deviceSn: true, channel: true },
      }),
    ]);
    for (const row of inventory) {
      bySn.set(row.deviceSn, xlvChannelDisplay(row.channel));
    }
    for (const row of devices) {
      const labeled = xlvChannelDisplay(row.channel);
      if (labeled) bySn.set(row.deviceSn, labeled);
    }
  }

  for (const item of items) {
    (item as T & { channel: string | null }).channel =
      bySn.get(item.deviceSn) ?? null;
  }
}

export async function loadXlvChannelCounts(forManagerName?: string | null) {
  const scope = forManagerName?.trim();
  const grouped = await db.xlvInventoryDevice.groupBy({
    by: ["channel"],
    where: scope ? { managerName: scope } : {},
    _count: { _all: true },
  });

  let fubei = 0;
  let leshua = 0;
  let unknown = 0;
  for (const row of grouped) {
    const label = xlvChannelLabel(row.channel);
    const count = row._count._all;
    if (label === "付呗") fubei += count;
    else if (label === "乐刷") leshua += count;
    else unknown += count;
  }
  return { fubei, leshua, unknown };
}
