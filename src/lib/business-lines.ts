/** 业务线分区：入口选择页 → 各自空间 */

export const BUSINESS_LINES = {
  xlh: {
    id: "xlh",
    name: "小蓝环",
    description: "支付宝小蓝环拓展 · 动销与风控看板",
    href: "/xlh",
  },
  n7: {
    id: "n7",
    name: "支付宝 N7",
    description: "机具考核 · 今日待办与达标跟进",
    href: "/n7",
  },
} as const;

export type BusinessLineId = keyof typeof BUSINESS_LINES;

export const ALL_BUSINESS_LINE_IDS: BusinessLineId[] = ["xlh", "n7"];

/** 新建/导入经理默认两边都开 */
export const DEFAULT_BUSINESS_LINES: BusinessLineId[] = ["xlh", "n7"];

export const XLH_BASE = "/xlh";
export const N7_BASE = "/n7";

export function isBusinessLineId(value: string): value is BusinessLineId {
  return value === "xlh" || value === "n7";
}

/** 规范化存储值；非法项丢弃；空数组表示无业务线权限 */
export function normalizeBusinessLines(
  raw: string[] | null | undefined
): BusinessLineId[] {
  if (!raw?.length) return [];
  const seen = new Set<BusinessLineId>();
  for (const item of raw) {
    if (isBusinessLineId(item)) seen.add(item);
  }
  return ALL_BUSINESS_LINE_IDS.filter((id) => seen.has(id));
}

/**
 * 实际可访问业务线：
 * - DIRECTOR：始终两条
 * - 其他：按账号上的 businessLines
 */
export function resolveAccessibleBusinessLines(
  role: string,
  stored: string[] | null | undefined
): BusinessLineId[] {
  if (role === "DIRECTOR") return [...ALL_BUSINESS_LINE_IDS];
  return normalizeBusinessLines(stored);
}

export function canAccessBusinessLine(
  role: string,
  stored: string[] | null | undefined,
  line: BusinessLineId
): boolean {
  return resolveAccessibleBusinessLines(role, stored).includes(line);
}

/** 小蓝环业务内路径 */
export function xlhPath(path = ""): string {
  if (!path || path === "/") return XLH_BASE;
  return path.startsWith("/") ? `${XLH_BASE}${path}` : `${XLH_BASE}/${path}`;
}

/** N7 业务内路径 */
export function n7Path(path = ""): string {
  if (!path || path === "/") return N7_BASE;
  return path.startsWith("/") ? `${N7_BASE}${path}` : `${N7_BASE}/${path}`;
}

export function isBusinessHubPath(pathname: string): boolean {
  return pathname === "/";
}

export function isXlhPath(pathname: string): boolean {
  return pathname === XLH_BASE || pathname.startsWith(`${XLH_BASE}/`);
}

export function isN7Path(pathname: string): boolean {
  return pathname === N7_BASE || pathname.startsWith(`${N7_BASE}/`);
}

/** 是否显示业务内完整侧栏 */
export function showBusinessShell(pathname: string): boolean {
  return isXlhPath(pathname) || isN7Path(pathname);
}

export function currentBusinessLine(pathname: string): BusinessLineId | null {
  if (isXlhPath(pathname)) return "xlh";
  if (isN7Path(pathname)) return "n7";
  return null;
}

/** 需从旧书签重定向到 /xlh 的路径前缀 */
export const LEGACY_XLH_PATH_PREFIXES = [
  "/ledger",
  "/teams",
  "/opportunities",
  "/members",
  "/admin",
  "/screen",
] as const;
