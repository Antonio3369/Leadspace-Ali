import { calculateCoreMetrics } from "@/services/stats/calculator";
import { generateRiskAlert, resolveAlertScope } from "@/services/stats/alert-generator";
import {
  fetchMerchantsForStats,
  resolveMerchantWhere,
  type StatsQueryOptions,
} from "@/services/stats/query";
import {
  assertDirectorCanViewManager,
  assertManagerCanViewStaff,
  buildManagerMerchantWhere,
  buildStaffMerchantWhere,
  getManagerOrThrow,
  withExpandDateRange,
} from "@/services/stats/manager-scope";
import { getChartDataByWhere, getSalesStaffMonthlyRankingForManager } from "@/services/stats/analytics";
import { parseDateToParam } from "@/lib/ledger-date";
import type { SessionUser } from "@/lib/permissions";

export interface DateRangeOptions {
  dateFrom?: string;
  dateTo?: string;
}

export async function getStatsForUser(
  user: SessionUser,
  options: Partial<Omit<StatsQueryOptions, "dateFrom" | "dateTo">> & {
    view?: "team" | "personal";
    managerId?: string;
    staffId?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
  } = {}
) {
  let merchants;
  let query: StatsQueryOptions;

  const dateFromStr =
    typeof options.dateFrom === "string"
      ? options.dateFrom
      : options.dateFrom
        ? formatDateParam(options.dateFrom)
        : undefined;
  const dateToStr =
    typeof options.dateTo === "string"
      ? options.dateTo
      : options.dateTo
        ? formatDateParam(options.dateTo)
        : undefined;

  if (options.staffId) {
    await assertManagerCanViewStaff(user, options.staffId);
    const where = await buildStaffMerchantWhere(
      options.staffId,
      dateFromStr,
      dateToStr
    );
    merchants = await fetchMerchantsForStats(where);
    query = { scope: "personal" };
  } else if (options.managerId) {
    await assertDirectorCanViewManager(user, options.managerId);
    const where = withExpandDateRange(
      await buildManagerMerchantWhere(options.managerId),
      dateFromStr,
      dateToStr
    );
    merchants = await fetchMerchantsForStats(where);
    query = { scope: "team" };
  } else {
    const { where, query: resolvedQuery } = await resolveMerchantWhere(user, {
      ...options,
      dateFrom: options.dateFrom instanceof Date ? options.dateFrom : dateFromStr ? parseDateParam(dateFromStr) : undefined,
      dateTo: options.dateTo instanceof Date ? options.dateTo : dateToStr ? parseDateToParam(dateToStr) : undefined,
    });
    query = resolvedQuery;
    merchants = await fetchMerchantsForStats(where);
  }

  const metrics = calculateCoreMetrics(merchants);
  const alertScope = options.staffId
    ? "personal"
    : options.managerId
      ? "team"
      : resolveAlertScope(user.role, options.view);
  const alert = generateRiskAlert(metrics, alertScope);

  return { metrics, alert, query };
}

function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateParam(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

export async function getManagerDashboard(
  user: SessionUser,
  managerId: string,
  options: DateRangeOptions = {}
) {
  await assertDirectorCanViewManager(user, managerId);
  const manager = await getManagerOrThrow(managerId);
  const where = withExpandDateRange(
    await buildManagerMerchantWhere(managerId),
    options.dateFrom,
    options.dateTo
  );

  const [{ metrics, alert, charts }, salesStaffRanking] = await Promise.all([
    (async () => {
      const payload = await getChartDataByWhere(where);
      return {
        metrics: payload.metrics,
        alert: generateRiskAlert(payload.metrics, "team"),
        charts: payload,
      };
    })(),
    getSalesStaffMonthlyRankingForManager(managerId),
  ]);

  return { manager, metrics, alert, charts, salesStaffRanking };
}

export async function getStaffDashboard(
  user: SessionUser,
  staffId: string,
  options: DateRangeOptions = {}
) {
  const staff = await assertManagerCanViewStaff(user, staffId);
  const where = await buildStaffMerchantWhere(staffId, options.dateFrom, options.dateTo);

  const payload = await getChartDataByWhere(where);
  const metrics = payload.metrics;
  const alert = generateRiskAlert(metrics, "personal");

  return { staff, metrics, alert, charts: payload };
}
