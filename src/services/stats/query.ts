import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/permissions";
import { db } from "@/lib/db";
import { buildManagerMerchantWhere } from "@/services/stats/manager-scope";

export type StatsScope = "global" | "team" | "personal";

export interface StatsQueryOptions {
  scope: StatsScope;
  userId?: string;
  teamId?: string;
  opportunityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface CoreMetrics {
  totalMerchants: number;
  photoPassRate: number;
  salesActivationRate: number;
  riskComplianceRate: number;
  riskUnderReview: number;
  riskReviewActivated: number;
  riskFailed: number;
  estimatedRiskRate: number;
  /** 原始计数，供预警文案使用 */
  photoApprovedCount: number;
  photoTotalCount: number;
  salesActivatedCount: number;
  riskPassedCount: number;
}

function buildDateFilter(
  dateFrom?: Date,
  dateTo?: Date
): Prisma.MerchantRecordWhereInput {
  if (!dateFrom && !dateTo) return {};
  return {
    expandDate: {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    },
  };
}

export function buildMerchantWhere(
  options: StatsQueryOptions
): Prisma.MerchantRecordWhereInput {
  const base: Prisma.MerchantRecordWhereInput = {
    ...buildDateFilter(options.dateFrom, options.dateTo),
    ...(options.opportunityId ? { opportunityId: options.opportunityId } : {}),
  };

  switch (options.scope) {
    case "global":
      return base;
    case "team":
      return { ...base, teamId: options.teamId };
    case "personal":
      return { ...base, salesUserId: options.userId };
    default:
      return base;
  }
}

export async function fetchMerchantsForStats(
  where: Prisma.MerchantRecordWhereInput
) {
  return cachedMerchantQuery(`stats:${stableWhereKey(where)}`, () =>
    db.merchantRecord.findMany({
      where,
      select: {
        photoStatus: true,
        riskStatus: true,
        salesActivationStatus: true,
        touchCount15d: true,
        scanCount15d: true,
        transactionCount30d: true,
      },
    })
  );
}

const DEV_CACHE_TTL_MS = process.env.NODE_ENV === "development" ? 60_000 : 0;
const merchantQueryCache = new Map<string, { expires: number; data: unknown }>();

export function stableWhereKey(where: Prisma.MerchantRecordWhereInput): string {
  return JSON.stringify(where);
}

/** 开发环境短时缓存，避免首页等指标重复全量扫表 */
export async function cachedMerchantQuery<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  if (!DEV_CACHE_TTL_MS) return fetcher();

  const hit = merchantQueryCache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.data as T;
  }

  const data = await fetcher();
  merchantQueryCache.set(key, { expires: Date.now() + DEV_CACHE_TTL_MS, data });
  if (merchantQueryCache.size > 32) {
    const oldest = merchantQueryCache.keys().next().value;
    if (oldest) merchantQueryCache.delete(oldest);
  }
  return data;
}

/** 按当前用户权限解析商户查询条件（经理默认所辖团队） */
export async function resolveMerchantWhere(
  user: SessionUser,
  options: Partial<StatsQueryOptions> & { view?: "team" | "personal" } = {}
): Promise<{ where: Prisma.MerchantRecordWhereInput; query: StatsQueryOptions }> {
  if (user.role === "MANAGER") {
    const hasStaffFilter = Boolean(options.userId);
    const hasTeamFilter = Boolean(options.teamId);

    if (!hasStaffFilter && !hasTeamFilter) {
      const baseWhere = await buildManagerMerchantWhere(user.id);
      const dateFilter = buildDateFilter(options.dateFrom, options.dateTo);
      const oppFilter = options.opportunityId
        ? { opportunityId: options.opportunityId }
        : {};
      const parts = [baseWhere, dateFilter, oppFilter].filter(
        (part) => Object.keys(part).length > 0
      );
      const where = parts.length === 1 ? parts[0]! : { AND: parts };
      return { where, query: { scope: "team", ...options } };
    }
  }

  const query = await resolveStatsQuery(user, options);
  return { where: buildMerchantWhere(query), query };
}

export async function getAccessibleUserIds(
  user: SessionUser
): Promise<string[] | null> {
  switch (user.role) {
    case "DIRECTOR":
      return null;
    case "MANAGER": {
      const subordinates = await db.user.findMany({
        where: {
          OR: [
            { managerId: user.id },
            { manager: { managerId: user.id } },
            { id: user.id },
          ],
          status: { in: ["ACTIVE", "RESIGNED", "DISABLED"] },
        },
        select: { id: true },
      });
      return subordinates.map((u) => u.id);
    }
    case "SUPERVISOR": {
      const teamMembers = await db.user.findMany({
        where: {
          OR: [{ teamId: user.teamId }, { id: user.id }],
        },
        select: { id: true },
      });
      return teamMembers.map((u) => u.id);
    }
    case "SALES":
      return [user.id];
    default:
      return [];
  }
}

export async function getAccessibleTeamIds(
  user: SessionUser
): Promise<string[] | null> {
  switch (user.role) {
    case "DIRECTOR":
      return null;
    case "MANAGER": {
      const teams = await db.orgUnit.findMany({
        where: {
          OR: [
            { users: { some: { managerId: user.id } } },
            { users: { some: { id: user.id } } },
          ],
          type: "TEAM",
        },
        select: { id: true },
      });
      return teams.map((t) => t.id);
    }
    case "SUPERVISOR":
      return user.teamId ? [user.teamId] : [];
    case "SALES":
      return user.teamId ? [user.teamId] : [];
    default:
      return [];
  }
}

export async function resolveStatsQuery(
  user: SessionUser,
  options: Partial<StatsQueryOptions> & { view?: "team" | "personal" }
): Promise<StatsQueryOptions> {
  const accessibleUserIds = await getAccessibleUserIds(user);
  const accessibleTeamIds = await getAccessibleTeamIds(user);

  if (user.role === "SUPERVISOR" && options.view === "personal") {
    return {
      scope: "personal",
      userId: user.id,
      ...options,
    };
  }

  if (user.role === "SUPERVISOR" && (options.view === "team" || !options.view)) {
    return {
      scope: "team",
      teamId: user.teamId ?? undefined,
      ...options,
    };
  }

  if (user.role === "SALES") {
    return { scope: "personal", userId: user.id, ...options };
  }

  if (options.scope === "team" && options.teamId) {
    if (accessibleTeamIds !== null && !accessibleTeamIds.includes(options.teamId)) {
      throw new Error("无权访问该团队");
    }
    return { scope: "team", ...options };
  }

  if (options.scope === "personal" && options.userId) {
    if (accessibleUserIds !== null && !accessibleUserIds.includes(options.userId)) {
      throw new Error("无权访问该人员");
    }
    return { scope: "personal", ...options };
  }

  if (user.role === "MANAGER") {
    if (user.teamId) {
      return { scope: "team", teamId: user.teamId, ...options };
    }
    return { scope: "personal", userId: user.id, ...options };
  }

  return { scope: "global", ...options };
}
