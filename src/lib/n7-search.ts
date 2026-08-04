import type { Prisma } from "@/generated/prisma/client";

export const N7_DEVICE_SEARCH_LIMIT = 50;

/** 按门店名 / 设备 SN / 商户手机筛选 N7 设备列表（客户端） */
export function filterN7DevicesByQuery<
  T extends {
    deviceSn: string;
    storeName: string | null;
    merchantPhone?: string | null;
  },
>(list: T[], query: string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return list;
  const q = trimmed.toLowerCase();
  return list.filter(
    (d) =>
      d.deviceSn.toLowerCase().includes(q) ||
      (d.storeName ?? "").toLowerCase().includes(q) ||
      (d.merchantPhone ?? "").includes(trimmed)
  );
}

/** 服务端跨月搜索：有搜索词时不限注册日期 */
export function buildN7DeviceTextSearchPrismaWhere(
  query: string
): Prisma.N7DeviceRecordWhereInput {
  const trimmed = query.trim();
  if (!trimmed) return {};
  return {
    OR: [
      { deviceSn: { contains: trimmed, mode: "insensitive" } },
      { storeName: { contains: trimmed, mode: "insensitive" } },
      { merchantPhone: { contains: trimmed } },
    ],
  };
}

/** 搜索提示文案：多数场景只命中 1 条，不强调数量 */
export function n7SearchResultHint(count: number, crossMonth = false): string {
  if (count === 0) return "未找到匹配设备";
  if (count === 1) {
    return crossMonth ? "已找到匹配设备（不限注册月份）" : "已找到匹配设备";
  }
  return crossMonth
    ? `搜索到 ${count} 条（不限注册月份）`
    : `搜索到 ${count} 条`;
}
