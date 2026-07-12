import {
  classifySalesFailureReason,
  isSalesActivated,
} from "@/lib/business-rules";
import { calculateCoreMetrics } from "@/services/stats/calculator";
import { generateRiskAlert, resolveAlertScope } from "@/services/stats/alert-generator";
import {
  buildMerchantWhere,
  cachedMerchantQuery,
  resolveMerchantWhere,
  resolveStatsQuery,
  stableWhereKey,
  type StatsQueryOptions,
} from "@/services/stats/query";
import type { SessionUser } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { Prisma, PhotoStatus, RiskStatus, SalesActivationStatus } from "@/generated/prisma/client";
import {
  buildManagerManagedUserWhere,
  buildManagerMerchantWhere,
  buildManagerStaffUserWhere,
  getManagerOrThrow,
  withExpandDateRange,
} from "@/services/stats/manager-scope";
import { formatDateInput, formatDateRangeLabel, getMonthRange, parseDateFromParam, parseDateToParam } from "@/lib/ledger-date";
import { toTeamDetailMetrics, type TeamDetailRow } from "@/lib/team-details";

const MERCHANT_CHART_SELECT = {
  photoStatus: true,
  riskStatus: true,
  salesActivationStatus: true,
  touchCount15d: true,
  scanCount15d: true,
  transactionCount30d: true,
  expandDate: true,
  opportunityName: true,
  opportunityId: true,
} as const;

type MerchantChartRow = {
  photoStatus: PhotoStatus;
  riskStatus: RiskStatus;
  salesActivationStatus: SalesActivationStatus;
  touchCount15d: number;
  scanCount15d: number;
  transactionCount30d: number;
  expandDate: Date;
  opportunityName: string | null;
  opportunityId: string | null;
};

function computeChartPayload(merchants: MerchantChartRow[]) {
  const metrics = calculateCoreMetrics(merchants);

  const riskDistribution = [
    { name: "风控通过", value: merchants.filter((m) => m.riskStatus === "PASSED").length, key: "PASSED" },
    { name: "审核中", value: merchants.filter((m) => m.riskStatus === "PENDING").length, key: "PENDING" },
    { name: "风控不通过", value: merchants.filter((m) => m.riskStatus === "FAILED").length, key: "FAILED" },
  ].filter((d) => d.value > 0);

  const failureMap = new Map<string, number>();
  for (const m of merchants) {
    if (isSalesActivated(m)) continue;
    const reason = classifySalesFailureReason(m);
    failureMap.set(reason, (failureMap.get(reason) ?? 0) + 1);
  }
  const salesFailureDistribution = [...failureMap.entries()].map(([name, value]) => ({
    name,
    value,
  }));

  const oppMap = new Map<string, { name: string; merchants: MerchantChartRow[] }>();
  for (const m of merchants) {
    const name = m.opportunityName ?? "未分类";
    if (!oppMap.has(name)) oppMap.set(name, { name, merchants: [] });
    oppMap.get(name)!.merchants.push(m);
  }

  const opportunityStats = [...oppMap.values()]
    .map(({ name, merchants: ms }) => {
      const om = calculateCoreMetrics(ms);
      return {
        name,
        totalMerchants: om.totalMerchants,
        photoPassRate: om.photoPassRate,
        salesActivationRate: om.salesActivationRate,
        riskComplianceRate: om.riskComplianceRate,
        estimatedRiskRate: om.estimatedRiskRate,
      };
    })
    .sort((a, b) => b.totalMerchants - a.totalMerchants);

  const dayMap = new Map<string, { date: string; expand: number; activated: number }>();
  for (const m of merchants) {
    const date = m.expandDate.toISOString().slice(0, 10);
    if (!dayMap.has(date)) dayMap.set(date, { date, expand: 0, activated: 0 });
    const d = dayMap.get(date)!;
    d.expand++;
    if (isSalesActivated(m)) d.activated++;
  }
  const dailyTrend = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    metrics,
    riskDistribution,
    salesFailureDistribution,
    opportunityStats,
    dailyTrend,
  };
}

async function fetchMerchantsForCharts(where: Prisma.MerchantRecordWhereInput) {
  return cachedMerchantQuery(`charts:${stableWhereKey(where)}`, () =>
    db.merchantRecord.findMany({
      where,
      select: MERCHANT_CHART_SELECT,
    })
  );
}

/** 首页/总览：一次查库同时产出指标与图表 */
export async function getDashboardBundle(
  user: SessionUser,
  options: Partial<StatsQueryOptions> & { view?: "team" | "personal" } = {}
) {
  const { where, query } = await resolveMerchantWhere(user, options);
  const merchants = await fetchMerchantsForCharts(where);
  const payload = computeChartPayload(merchants);
  const alertScope = resolveAlertScope(user.role, options.view);

  return {
    metrics: payload.metrics,
    alert: generateRiskAlert(payload.metrics, alertScope),
    charts: {
      riskDistribution: payload.riskDistribution,
      salesFailureDistribution: payload.salesFailureDistribution,
      opportunityStats: payload.opportunityStats,
      dailyTrend: payload.dailyTrend,
    },
    query,
  };
}

/** 按任意 where 条件生成图表数据（经理详情等） */
export async function getChartDataByWhere(where: Prisma.MerchantRecordWhereInput) {
  const merchants = await fetchMerchantsForCharts(where);
  return computeChartPayload(merchants);
}

export async function getChartData(
  user: SessionUser,
  options: Partial<StatsQueryOptions> & { view?: "team" | "personal" } = {}
) {
  const { where, query } = await resolveMerchantWhere(user, options);
  const merchants = await fetchMerchantsForCharts(where);

  return {
    ...computeChartPayload(merchants),
    query,
  };
}

export const UNCATEGORIZED_OPPORTUNITY_ID = "__uncategorized__";

const OPPORTUNITY_METRICS_SELECT = {
  photoStatus: true,
  riskStatus: true,
  salesActivationStatus: true,
  touchCount15d: true,
  scanCount15d: true,
  transactionCount30d: true,
  opportunityId: true,
  opportunityName: true,
} as const;

function buildOpportunityFilter(opportunityId: string): Prisma.MerchantRecordWhereInput {
  if (opportunityId === UNCATEGORIZED_OPPORTUNITY_ID) {
    return { opportunityId: null };
  }
  return { opportunityId };
}

export interface OpportunityListItem {
  id: string;
  name: string;
  totalMerchants: number;
  photoPassRate: number;
  salesActivationRate: number;
  riskComplianceRate: number;
  estimatedRiskRate: number;
}

/** 商机专项：权限范围内各商机汇总列表 */
export async function getOpportunityAnalysisList(
  user: SessionUser,
  options: { view?: "team" | "personal"; dateFrom?: Date; dateTo?: Date } = {}
) {
  const { where } = await resolveMerchantWhere(user, options);

  const merchants = await db.merchantRecord.findMany({
    where,
    select: OPPORTUNITY_METRICS_SELECT,
  });

  const byOpp = new Map<string, { id: string; name: string; merchants: typeof merchants }>();
  for (const m of merchants) {
    const id = m.opportunityId ?? UNCATEGORIZED_OPPORTUNITY_ID;
    const name = m.opportunityName ?? "未分类";
    if (!byOpp.has(id)) byOpp.set(id, { id, name, merchants: [] });
    byOpp.get(id)!.merchants.push(m);
  }

  const opportunities = [...byOpp.values()]
    .map(({ id, name, merchants: ms }) => {
      const om = calculateCoreMetrics(ms);
      return {
        id,
        name,
        totalMerchants: om.totalMerchants,
        photoPassRate: om.photoPassRate,
        salesActivationRate: om.salesActivationRate,
        riskComplianceRate: om.riskComplianceRate,
        estimatedRiskRate: om.estimatedRiskRate,
      };
    })
    .sort((a, b) => b.totalMerchants - a.totalMerchants);

  return { opportunities };
}

/** 商机专项：单个商机深度分析 */
export async function getOpportunityAnalysisDetail(
  user: SessionUser,
  opportunityId: string,
  options: { view?: "team" | "personal"; dateFrom?: Date; dateTo?: Date } = {}
) {
  const { where: scopeWhere } = await resolveMerchantWhere(user, options);
  const where: Prisma.MerchantRecordWhereInput = {
    AND: [scopeWhere, buildOpportunityFilter(opportunityId)],
  };

  let name = "未分类";
  if (opportunityId !== UNCATEGORIZED_OPPORTUNITY_ID) {
    const opp = await db.opportunity.findUnique({
      where: { id: opportunityId },
      select: { name: true },
    });
    if (!opp) throw new Error("商机不存在");
    name = opp.name;
  }

  const chartData = await getChartDataByWhere(where);

  return {
    opportunity: { id: opportunityId, name },
    metrics: chartData.metrics,
    charts: {
      riskDistribution: chartData.riskDistribution,
      salesFailureDistribution: chartData.salesFailureDistribution,
      dailyTrend: chartData.dailyTrend,
    },
  };
}

export interface ManagerTeamRankingItem {
  rank: number;
  managerId: string;
  managerName: string;
  teamId: string;
  memberCount: number;
  monthlyExpand: number;
  riskComplianceRate: number;
  riskPassedCount: number;
  riskUnderReview: number;
  riskReviewActivated: number;
  estimatedRiskRate: number;
  riskNonCompliant: number;
}

/** 经理团队拓展数排名（高 → 低） */
export async function getManagerTeamMonthlyRanking(
  _user: SessionUser,
  monthParam?: string
): Promise<{ monthLabel: string; monthParam: string; ranking: ManagerTeamRankingItem[] }> {
  const { label, monthParam: resolved, dateFrom, dateTo } = getMonthRange(monthParam ?? "");

  const managers = await db.user.findMany({
    where: { role: "MANAGER", status: "ACTIVE" },
    select: { id: true, name: true, teamId: true },
    orderBy: { name: "asc" },
  });

  if (managers.length === 0) {
    return { monthLabel: label, monthParam: resolved, ranking: [] };
  }

  const merchantSelect = {
    photoStatus: true,
    riskStatus: true,
    salesActivationStatus: true,
    touchCount15d: true,
    scanCount15d: true,
    transactionCount30d: true,
  } as const;

  const rows = await Promise.all(
    managers.map(async (mgr) => {
      const staffWhere = await buildManagerManagedUserWhere(mgr.id);
      const [memberCount, teamMerchants] = await Promise.all([
        db.user.count({
          where: { AND: [staffWhere, { status: "ACTIVE" }] },
        }),
        db.merchantRecord.findMany({
          where: withExpandDateRange(
            await buildManagerMerchantWhere(mgr.id),
            dateFrom,
            dateTo
          ),
          select: merchantSelect,
        }),
      ]);

      const metrics = calculateCoreMetrics(teamMerchants);
      return {
        rank: 0,
        managerId: mgr.id,
        managerName: mgr.name,
        teamId: mgr.teamId ?? mgr.id,
        memberCount,
        monthlyExpand: metrics.totalMerchants,
        riskComplianceRate: metrics.riskComplianceRate,
        riskPassedCount: metrics.riskPassedCount,
        riskUnderReview: metrics.riskUnderReview,
        riskReviewActivated: metrics.riskReviewActivated,
        estimatedRiskRate: metrics.estimatedRiskRate,
        riskNonCompliant: metrics.riskFailed,
      };
    })
  );

  const ranking = rows
    .sort((a, b) => b.monthlyExpand - a.monthlyExpand)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  return { monthLabel: label, monthParam: resolved, ranking };
}

export interface SalesStaffRankingItem {
  rank: number;
  salesUserId: string;
  salesName: string;
  monthlyExpand: number;
  riskComplianceRate: number;
  riskPassedCount: number;
  riskUnderReview: number;
  riskReviewActivated: number;
  estimatedRiskRate: number;
  riskNonCompliant: number;
}

/** 经理所辖业务人员拓展排名（高 → 低），与详情页拓展日期范围一致 */
export async function getSalesStaffMonthlyRankingForManager(
  managerId: string,
  options: { dateFrom?: string; dateTo?: string } = {}
): Promise<{ rangeLabel: string; ranking: SalesStaffRankingItem[] }> {
  const { dateFrom, dateTo } = options;
  const rangeLabel = formatDateRangeLabel(dateFrom ?? "", dateTo ?? "");
  await getManagerOrThrow(managerId);

  const staffWhere = await buildManagerStaffUserWhere(managerId);

  const staff = await db.user.findMany({
    where: staffWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (staff.length === 0) {
    return { rangeLabel, ranking: [] };
  }

  const staffIds = staff.map((s) => s.id);

  const merchants = await db.merchantRecord.findMany({
    where: withExpandDateRange({ salesUserId: { in: staffIds } }, dateFrom, dateTo),
    select: {
      salesUserId: true,
      photoStatus: true,
      riskStatus: true,
      salesActivationStatus: true,
      touchCount15d: true,
      scanCount15d: true,
      transactionCount30d: true,
    },
  });

  const merchantsByStaff = new Map<string, typeof merchants>();
  for (const m of merchants) {
    if (!m.salesUserId) continue;
    if (!merchantsByStaff.has(m.salesUserId)) merchantsByStaff.set(m.salesUserId, []);
    merchantsByStaff.get(m.salesUserId)!.push(m);
  }

  const ranking = staff
    .map((person) => {
      const personMerchants = merchantsByStaff.get(person.id) ?? [];
      const metrics = calculateCoreMetrics(personMerchants);
      return {
        rank: 0,
        salesUserId: person.id,
        salesName: person.name,
        monthlyExpand: metrics.totalMerchants,
        riskComplianceRate: metrics.riskComplianceRate,
        riskPassedCount: metrics.riskPassedCount,
        riskUnderReview: metrics.riskUnderReview,
        riskReviewActivated: metrics.riskReviewActivated,
        estimatedRiskRate: metrics.estimatedRiskRate,
        riskNonCompliant: metrics.riskFailed,
      };
    })
    .sort((a, b) => b.monthlyExpand - a.monthlyExpand || a.salesName.localeCompare(b.salesName, "zh"))
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  return { rangeLabel, ranking };
}

export function shouldShowManagerRanking(
  role: SessionUser["role"],
  view?: "team" | "personal"
): boolean {
  if (role === "SALES") return false;
  if (role === "SUPERVISOR" && view === "personal") return false;
  return true;
}

export interface LedgerQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  teamId?: string;
  managerId?: string;
  salesUserId?: string;
  opportunityId?: string;
  photoStatus?: string[];
  riskStatus?: string[];
  salesActivationStatus?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

const LEDGER_EXPORT_LIMIT = 50_000;

export { LEDGER_EXPORT_LIMIT };

export interface LedgerSummary {
  risk: { PENDING: number; PASSED: number; FAILED: number };
  photo: { PENDING: number; APPROVED: number; REJECTED: number };
  sales: { NOT_ACTIVATED: number; IN_PROGRESS: number; ACTIVATED: number };
}

async function getLedgerSummary(
  where: Prisma.MerchantRecordWhereInput
): Promise<LedgerSummary> {
  const [riskRows, photoRows, salesRows] = await Promise.all([
    db.merchantRecord.groupBy({
      by: ["riskStatus"],
      where,
      _count: { _all: true },
    }),
    db.merchantRecord.groupBy({
      by: ["photoStatus"],
      where,
      _count: { _all: true },
    }),
    db.merchantRecord.groupBy({
      by: ["salesActivationStatus"],
      where,
      _count: { _all: true },
    }),
  ]);

  const risk = { PENDING: 0, PASSED: 0, FAILED: 0 };
  for (const row of riskRows) {
    risk[row.riskStatus] = row._count._all;
  }

  const photo = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const row of photoRows) {
    photo[row.photoStatus] = row._count._all;
  }

  const sales = { NOT_ACTIVATED: 0, IN_PROGRESS: 0, ACTIVATED: 0 };
  for (const row of salesRows) {
    sales[row.salesActivationStatus] = row._count._all;
  }

  return { risk, photo, sales };
}

export async function buildLedgerWhere(
  user: SessionUser,
  params: LedgerQuery
): Promise<Prisma.MerchantRecordWhereInput> {
  let scopeWhere: Prisma.MerchantRecordWhereInput;

  if (params.managerId) {
    if (user.role !== "DIRECTOR") {
      throw new Error("无权按经理筛选");
    }
    scopeWhere = withExpandDateRange(
      await buildManagerMerchantWhere(params.managerId),
      params.dateFrom,
      params.dateTo
    );
  } else {
    const resolved = await resolveMerchantWhere(user, {
      scope: params.teamId ? "team" : params.salesUserId ? "personal" : undefined,
      teamId: params.teamId,
      userId: params.salesUserId,
      dateFrom: params.dateFrom ? parseDateFromParam(params.dateFrom) : undefined,
      dateTo: params.dateTo ? parseDateToParam(params.dateTo) : undefined,
    });
    scopeWhere = resolved.where;
  }

  const filters: Prisma.MerchantRecordWhereInput[] = [scopeWhere];

  if (params.opportunityId) {
    filters.push({ opportunityId: params.opportunityId });
  }
  if (params.photoStatus && params.photoStatus.length > 0) {
    filters.push({
      photoStatus:
        params.photoStatus.length === 1
          ? (params.photoStatus[0] as Prisma.EnumPhotoStatusFilter["equals"])
          : { in: params.photoStatus as Prisma.EnumPhotoStatusFilter["in"] },
    });
  }
  if (params.riskStatus && params.riskStatus.length > 0) {
    filters.push({
      riskStatus:
        params.riskStatus.length === 1
          ? (params.riskStatus[0] as Prisma.EnumRiskStatusFilter["equals"])
          : { in: params.riskStatus as Prisma.EnumRiskStatusFilter["in"] },
    });
  }
  if (params.salesActivationStatus && params.salesActivationStatus.length > 0) {
    filters.push({
      salesActivationStatus:
        params.salesActivationStatus.length === 1
          ? (params.salesActivationStatus[0] as Prisma.EnumSalesActivationStatusFilter["equals"])
          : {
              in: params.salesActivationStatus as Prisma.EnumSalesActivationStatusFilter["in"],
            },
    });
  }
  if (params.search) {
    filters.push({
      OR: [
        { merchantName: { contains: params.search, mode: "insensitive" } },
        { jobNumber: { contains: params.search, mode: "insensitive" } },
        { salesUserName: { contains: params.search, mode: "insensitive" } },
      ],
    });
  }

  return filters.length === 1 ? filters[0]! : { AND: filters };
}

export async function getLedgerRecordsForExport(
  user: SessionUser,
  params: Omit<LedgerQuery, "page" | "pageSize">
) {
  const where = await buildLedgerWhere(user, params);
  const sortBy = params.sortBy ?? "expandDate";
  const sortOrder = params.sortOrder ?? "desc";

  const total = await db.merchantRecord.count({ where });
  if (total > LEDGER_EXPORT_LIMIT) {
    throw new Error(`导出数据量过大（${total.toLocaleString()} 条），请缩小筛选范围后重试（上限 ${LEDGER_EXPORT_LIMIT.toLocaleString()} 条）`);
  }

  return db.merchantRecord.findMany({
    where,
    include: {
      team: { select: { name: true } },
      opportunity: { select: { name: true } },
    },
    orderBy: { [sortBy]: sortOrder },
  });
}

export async function getLedgerRecords(
  user: SessionUser,
  params: LedgerQuery
) {
  const where = await buildLedgerWhere(user, params);

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "expandDate";
  const sortOrder = params.sortOrder ?? "desc";

  const [total, summary, records] = await Promise.all([
    db.merchantRecord.count({ where }),
    getLedgerSummary(where),
    db.merchantRecord.findMany({
      where,
      include: {
        salesUser: { select: { name: true } },
        team: { select: { name: true } },
        opportunity: { select: { name: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, page, pageSize, summary, records, exportLimit: LEDGER_EXPORT_LIMIT };
}

export interface MemberQuery {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

const MEMBER_METRICS_SELECT = {
  salesUserId: true,
  teamId: true,
  photoStatus: true,
  riskStatus: true,
  salesActivationStatus: true,
  touchCount15d: true,
  scanCount15d: true,
  transactionCount30d: true,
} as const;

export async function getMemberStats(user: SessionUser, params: MemberQuery = {}) {
  const { search, dateFrom, dateTo } = params;

  if (user.role === "DIRECTOR") {
    return getManagerListStats(params);
  }

  if (user.role === "MANAGER") {
    return getManagerStaffListStats(user, params);
  }

  const query = await resolveStatsQuery(user, {
    dateFrom: dateFrom ? parseDateFromParam(dateFrom) : undefined,
    dateTo: dateTo ? parseDateToParam(dateTo) : undefined,
  });
  const where = buildMerchantWhere({ ...query, scope: query.scope === "personal" ? "personal" : "global" });

  let userWhere: Prisma.UserWhereInput = { status: "ACTIVE" };
  if (user.role === "SUPERVISOR" && user.teamId) {
    userWhere = { ...userWhere, teamId: user.teamId };
  } else if (query.scope === "personal") {
    userWhere = { ...userWhere, id: user.id };
  }

  if (search) {
    userWhere = {
      ...userWhere,
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { team: { name: { contains: search, mode: "insensitive" } } },
      ],
    };
  }

  const members = await db.user.findMany({
    where: userWhere,
    include: { team: { select: { name: true } }, manager: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const allMerchants = await db.merchantRecord.findMany({
    where,
    select: MEMBER_METRICS_SELECT,
  });

  const byUser = new Map<string, typeof allMerchants>();
  for (const m of allMerchants) {
    if (!m.salesUserId) continue;
    if (!byUser.has(m.salesUserId)) byUser.set(m.salesUserId, []);
    byUser.get(m.salesUserId)!.push(m);
  }

  return {
    listType: "members" as const,
    canExport: false,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      teamName: member.team?.name ?? "-",
      managerName: member.manager?.name ?? "-",
      metrics: calculateCoreMetrics(byUser.get(member.id) ?? []),
    })),
  };
}

async function getManagerStaffListStats(user: SessionUser, params: MemberQuery) {
  const { search, dateFrom, dateTo } = params;
  const staffWhere = await buildManagerStaffUserWhere(user.id);

  const userWhere: Prisma.UserWhereInput = {
    AND: [
      staffWhere,
      ...(search ? [{ name: { contains: search, mode: "insensitive" as const } }] : []),
    ],
  };

  const staff = await db.user.findMany({
    where: userWhere,
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  if (staff.length === 0) {
    return { listType: "staff" as const, canExport: true, members: [] };
  }

  const staffIds = staff.map((s) => s.id);
  const merchants = await db.merchantRecord.findMany({
    where: withExpandDateRange({ salesUserId: { in: staffIds } }, dateFrom, dateTo),
    select: MEMBER_METRICS_SELECT,
  });

  const byUser = new Map<string, typeof merchants>();
  for (const m of merchants) {
    if (!m.salesUserId) continue;
    if (!byUser.has(m.salesUserId)) byUser.set(m.salesUserId, []);
    byUser.get(m.salesUserId)!.push(m);
  }

  return {
    listType: "staff" as const,
    canExport: true,
    members: staff.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      metrics: calculateCoreMetrics(byUser.get(person.id) ?? []),
    })),
  };
}

async function getManagerListStats(params: MemberQuery) {
  const { search, dateFrom, dateTo } = params;
  const userWhere: Prisma.UserWhereInput = {
    role: "MANAGER",
    status: "ACTIVE",
    ...(search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {}),
  };

  const managers = await db.user.findMany({
    where: userWhere,
    select: { id: true, name: true, role: true, teamId: true },
    orderBy: { name: "asc" },
  });

  const teamIds = managers.map((m) => m.teamId).filter((id): id is string => !!id);

  const merchants = await db.merchantRecord.findMany({
    where: withExpandDateRange({ teamId: { in: teamIds } }, dateFrom, dateTo),
    select: MEMBER_METRICS_SELECT,
  });

  const byTeam = new Map<string, typeof merchants>();
  for (const m of merchants) {
    if (!m.teamId) continue;
    if (!byTeam.has(m.teamId)) byTeam.set(m.teamId, []);
    byTeam.get(m.teamId)!.push(m);
  }

  return {
    listType: "managers" as const,
    canExport: false,
    members: managers.map((mgr) => ({
      id: mgr.id,
      name: mgr.name,
      role: mgr.role,
      metrics: calculateCoreMetrics(mgr.teamId ? (byTeam.get(mgr.teamId) ?? []) : []),
    })),
  };
}

async function getDirectorTeamDetails(params: MemberQuery) {
  const { search, dateFrom, dateTo } = params;
  const userWhere: Prisma.UserWhereInput = {
    role: "MANAGER",
    status: "ACTIVE",
    ...(search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {}),
  };

  const managers = await db.user.findMany({
    where: userWhere,
    select: { id: true, name: true, teamId: true },
    orderBy: { name: "asc" },
  });

  if (managers.length === 0) {
    return { listType: "managers" as const, canExport: false, rows: [] as TeamDetailRow[] };
  }

  const teamIds = [...new Set(managers.map((m) => m.teamId).filter((id): id is string => !!id))];

  type MerchantMetricRow = {
    teamId: string | null;
    salesUserId: string | null;
    photoStatus: PhotoStatus;
    riskStatus: RiskStatus;
    salesActivationStatus: SalesActivationStatus;
    touchCount15d: number;
    scanCount15d: number;
    transactionCount30d: number;
  };

  const [merchants, staffCountByTeam] = await Promise.all([
    teamIds.length > 0
      ? db.merchantRecord.findMany({
          where: withExpandDateRange({ teamId: { in: teamIds } }, dateFrom, dateTo),
          select: MEMBER_METRICS_SELECT,
        })
      : Promise.resolve([] as MerchantMetricRow[]),
    teamIds.length > 0
      ? db.user.groupBy({
          by: ["teamId"],
          where: {
            teamId: { in: teamIds },
            role: { in: ["SALES", "SUPERVISOR"] },
            status: "ACTIVE",
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const teamStaffCounts = new Map<string, number>();
  for (const row of staffCountByTeam) {
    if (row.teamId) teamStaffCounts.set(row.teamId, row._count._all);
  }

  const byTeam = new Map<string, MerchantMetricRow[]>();
  for (const m of merchants) {
    if (!m.teamId) continue;
    if (!byTeam.has(m.teamId)) byTeam.set(m.teamId, []);
    byTeam.get(m.teamId)!.push(m);
  }

  const managersWithoutTeam = managers.filter((m) => !m.teamId);
  const memberCountByManagerId = new Map<string, number>();
  for (const mgr of managersWithoutTeam) {
    const staffWhere = await buildManagerManagedUserWhere(mgr.id);
    const memberCount = await db.user.count({
      where: { AND: [staffWhere, { status: "ACTIVE" }] },
    });
    memberCountByManagerId.set(mgr.id, memberCount);
  }

  const rows = managers.map((mgr) => ({
    id: mgr.id,
    name: mgr.name,
    memberCount: mgr.teamId
      ? (teamStaffCounts.get(mgr.teamId) ?? 0)
      : (memberCountByManagerId.get(mgr.id) ?? 0),
    metrics: toTeamDetailMetrics(
      calculateCoreMetrics(mgr.teamId ? (byTeam.get(mgr.teamId) ?? []) : [])
    ),
  }));

  return { listType: "managers" as const, canExport: false, rows };
}

export async function getTeamDetails(user: SessionUser, params: MemberQuery = {}) {
  if (user.role === "DIRECTOR") {
    return getDirectorTeamDetails(params);
  }

  if (user.role === "MANAGER") {
    const { search, dateFrom, dateTo } = params;
    const staffWhere = await buildManagerStaffUserWhere(user.id);

    const userWhere: Prisma.UserWhereInput = {
      AND: [
        staffWhere,
        ...(search ? [{ name: { contains: search, mode: "insensitive" as const } }] : []),
      ],
    };

    const staff = await db.user.findMany({
      where: userWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (staff.length === 0) {
      return { listType: "staff" as const, canExport: true, rows: [] as TeamDetailRow[] };
    }

    const staffIds = staff.map((s) => s.id);
    const merchants = await db.merchantRecord.findMany({
      where: withExpandDateRange({ salesUserId: { in: staffIds } }, dateFrom, dateTo),
      select: MEMBER_METRICS_SELECT,
    });

    const byUser = new Map<string, typeof merchants>();
    for (const m of merchants) {
      if (!m.salesUserId) continue;
      if (!byUser.has(m.salesUserId)) byUser.set(m.salesUserId, []);
      byUser.get(m.salesUserId)!.push(m);
    }

    const rows = staff.map((person) => ({
      id: person.id,
      name: person.name,
      metrics: toTeamDetailMetrics(calculateCoreMetrics(byUser.get(person.id) ?? [])),
    }));

    return { listType: "staff" as const, canExport: true, rows };
  }

  return { listType: "none" as const, canExport: false, rows: [] as TeamDetailRow[] };
}
