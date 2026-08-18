import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionAuthRealm } from "@/lib/auth-realm";
import { canImportExcel, canLogin } from "@/lib/permissions";
import { loadXlvManagerComplianceByName } from "@/services/xlv/board";
import {
  enrichManagerReportWithCompliance,
  getInventorySummary,
  loadInventoryManagerReport,
  loadInventoryStaffReport,
  type InventoryOverview,
} from "@/services/xlv/inventory/service";

export const maxDuration = 120;

export const GET = auth(async (request) => {
  const user = request.auth?.user;
  if (!user || !canLogin(user.status)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const realm = sessionAuthRealm(user);
  const managerScope =
    user.role === "MANAGER"
      ? realm === "xlv"
        ? (user.xlvManagerName ?? user.name)
        : user.name
      : null;

  if (user.role !== "DIRECTOR" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "无权访问库存" }, { status: 403 });
  }

  const summary = await getInventorySummary(managerScope);
  const managersRaw = await loadInventoryManagerReport(
    user.role === "MANAGER" ? managerScope : null
  );
  const complianceByName = await loadXlvManagerComplianceByName(
    user.role === "MANAGER" ? managerScope : null
  );
  const managers = enrichManagerReportWithCompliance(
    managersRaw,
    complianceByName
  );
  const staff =
    user.role === "MANAGER" && managerScope
      ? await loadInventoryStaffReport(managerScope)
      : undefined;

  const ledgerTotal = managers.reduce((s, r) => s + r.ledgerTotal, 0);
  const deployed = managers.reduce((s, r) => s + r.deployed, 0);
  const stockRemaining = managers.reduce((s, r) => s + r.stockRemaining, 0);
  const complianceDevices = managers.reduce(
    (s, r) => s + r.complianceDeviceCount,
    0
  );
  const compliantDevices = managers.reduce(
    (s, r) => s + r.complianceCompliantCount,
    0
  );

  const overview: InventoryOverview = {
    scopeSummary: {
      ledgerTotal,
      deployed,
      stockRemaining,
      deployRate:
        ledgerTotal > 0
          ? Math.round((deployed / ledgerTotal) * 1000) / 10
          : 0,
      complianceRate:
        complianceDevices > 0
          ? Math.round((compliantDevices / complianceDevices) * 1000) / 10
          : null,
      adminStock: summary.counts.admin_stock ?? 0,
      pendingReceipt: summary.pendingReceipt,
    },
    managers,
    staff,
  };

  return NextResponse.json({ summary, managerScope, overview });
});
