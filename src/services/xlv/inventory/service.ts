import { randomBytes } from "crypto";
import type {
  XlvInventoryDeployedBy,
  XlvInventoryStatus,
  XlvInventoryTransferType,
  Prisma,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  inferDeployedByRole,
  isXlvManagerSelfSale,
  xlvWithdrawReturnStatus,
} from "@/lib/xlv-inventory";
import { isXlvManagerSelfSale as isManagerSelfSaleRule } from "@/lib/xlv-rules";
import {
  buildUserLookupIndexes,
  findManagerInIndexes,
  findUserInIndexes,
  type UserLookupIndexes,
} from "@/services/org/user-matcher";

function createId() {
  return `c${randomBytes(12).toString("hex")}`;
}

function createBatchId() {
  return `batch_${randomBytes(8).toString("hex")}`;
}

export type InventoryImportResult = {
  batchId: string;
  totalRows: number;
  successRows: number;
  skippedRows: number;
  errors: string[];
  warnings: string[];
};

type TransitionTarget = {
  status: XlvInventoryStatus;
  managerName?: string;
  operatorName?: string;
  channel?: string | null;
  deployedByRole?: XlvInventoryDeployedBy | null;
  deployedStoreName?: string | null;
  deployedAt?: Date | null;
};

async function writeTransfer(params: {
  deviceSn: string;
  transferType: XlvInventoryTransferType;
  fromStatus: XlvInventoryStatus | null;
  toStatus: XlvInventoryStatus;
  fromManagerName?: string | null;
  fromOperatorName?: string | null;
  toManagerName?: string | null;
  toOperatorName?: string | null;
  batchId: string;
  operatorUserId: string;
  note?: string;
  meta?: Prisma.InputJsonValue;
}) {
  await db.xlvInventoryTransfer.create({
    data: {
      id: createId(),
      deviceSn: params.deviceSn,
      transferType: params.transferType,
      fromStatus: params.fromStatus ?? undefined,
      toStatus: params.toStatus,
      fromManagerName: params.fromManagerName ?? undefined,
      fromOperatorName: params.fromOperatorName ?? undefined,
      toManagerName: params.toManagerName ?? undefined,
      toOperatorName: params.toOperatorName ?? undefined,
      batchId: params.batchId,
      operatorUserId: params.operatorUserId,
      note: params.note,
      meta: params.meta ?? undefined,
    },
  });
}

async function applyTransition(
  deviceSn: string,
  target: TransitionTarget,
  transfer: {
    type: XlvInventoryTransferType;
    batchId: string;
    operatorUserId: string;
    note?: string;
    meta?: Prisma.InputJsonValue;
  },
  ctx?: { indexes: UserLookupIndexes }
) {
  const existing = await db.xlvInventoryDevice.findUnique({
    where: { deviceSn },
  });

  const managerName = target.managerName ?? existing?.managerName ?? "";
  const operatorName = target.operatorName ?? existing?.operatorName ?? "";
  const indexes = ctx?.indexes ?? (await buildUserLookupIndexes());
  const managerUser = findManagerInIndexes(indexes, managerName);
  const salesUser = findUserInIndexes(indexes, operatorName);

  if (!existing) {
    await ensureDeviceRecordStub(deviceSn, managerName, operatorName);
  }

  const fromStatus = existing?.status ?? null;
  const fromManagerName = existing?.managerName ?? null;
  const fromOperatorName = existing?.operatorName ?? null;

  if (existing) {
    await db.xlvInventoryDevice.update({
      where: { deviceSn },
      data: {
        status: target.status,
        channel: target.channel ?? existing.channel,
        managerName,
        operatorName,
        managerUserId: managerUser?.id ?? null,
        salesUserId: salesUser?.id ?? null,
        deployedByRole:
          target.deployedByRole === undefined
            ? existing.deployedByRole
            : target.deployedByRole,
        deployedStoreName:
          target.deployedStoreName === undefined
            ? existing.deployedStoreName
            : target.deployedStoreName,
        deployedAt:
          target.deployedAt === undefined ? existing.deployedAt : target.deployedAt,
        importBatchId: transfer.batchId,
      },
    });
  } else {
    await db.xlvInventoryDevice.create({
      data: {
        id: createId(),
        deviceSn,
        status: target.status,
        channel: target.channel ?? null,
        managerName,
        operatorName,
        managerUserId: managerUser?.id ?? null,
        salesUserId: salesUser?.id ?? null,
        deployedByRole: target.deployedByRole ?? null,
        deployedStoreName: target.deployedStoreName ?? null,
        deployedAt: target.deployedAt ?? null,
        importBatchId: transfer.batchId,
      },
    });
  }

  await writeTransfer({
    deviceSn,
    transferType: transfer.type,
    fromStatus,
    toStatus: target.status,
    fromManagerName,
    fromOperatorName,
    toManagerName: managerName,
    toOperatorName: operatorName,
    batchId: transfer.batchId,
    operatorUserId: transfer.operatorUserId,
    note: transfer.note,
    meta: transfer.meta,
  });
}

function openingStatusForRow(
  managerName: string,
  operatorName: string,
  inSnAttribution: boolean
): XlvInventoryStatus {
  /** 在 SN 归属表内 = 已铺设；表外 = 库存（有作业员→队员库，否则→经理库） */
  if (inSnAttribution) return "deployed";
  if (!operatorName.trim() || isXlvManagerSelfSale(managerName, operatorName)) {
    return "manager_stock";
  }
  return "sales_stock";
}

/** 已导入 SN 归属表的 SN（以运营表有商户名为准，与归属 Excel 一致） */
async function loadSnAttributionSet() {
  const rows = await db.xlvDeviceRecord.findMany({
    where: { merchantName: { not: "" } },
    select: { deviceSn: true },
  });
  return new Set(rows.map((r) => r.deviceSn));
}

/** 库存 SN 须在 XlvDeviceRecord 存在（外键） */
async function ensureDeviceRecordStub(
  deviceSn: string,
  managerName = "",
  operatorName = ""
) {
  await db.xlvDeviceRecord.createMany({
    data: [
      {
        id: createId(),
        deviceSn,
        managerName: managerName.trim(),
        operatorName: operatorName.trim(),
      },
    ],
    skipDuplicates: true,
  });
}

/** 期初批量补建运营设备占位 */
async function ensureInventoryDeviceRecords(
  rows: { deviceSn: string; managerName: string; operatorName: string }[]
) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.xlvDeviceRecord.createMany({
      data: rows.slice(i, i + CHUNK).map((row) => ({
        id: createId(),
        deviceSn: row.deviceSn,
        managerName: row.managerName.trim(),
        operatorName: row.operatorName.trim(),
      })),
      skipDuplicates: true,
    });
  }
}

export async function importInboundRows(
  rows: { deviceSn: string; channel: string | null }[],
  operatorUserId: string
): Promise<InventoryImportResult> {
  const batchId = createBatchId();
  const errors: string[] = [];
  const warnings: string[] = [];
  let successRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const existing = await db.xlvInventoryDevice.findUnique({
      where: { deviceSn: row.deviceSn },
    });
    if (existing && existing.status !== "admin_stock") {
      skippedRows++;
      warnings.push(`${row.deviceSn}：已在库外流转，跳过`);
      continue;
    }
    await applyTransition(
      row.deviceSn,
      {
        status: "admin_stock",
        managerName: "",
        operatorName: "",
        channel: row.channel,
        deployedByRole: null,
        deployedStoreName: null,
        deployedAt: null,
      },
      { type: "inbound_admin", batchId, operatorUserId }
    );
    successRows++;
  }

  return {
    batchId,
    totalRows: rows.length,
    successRows,
    skippedRows,
    errors,
    warnings,
  };
}

export async function importAllocateToManagerRows(
  rows: { deviceSn: string; managerName: string; channel: string | null }[],
  operatorUserId: string
): Promise<InventoryImportResult> {
  const batchId = createBatchId();
  const warnings: string[] = [];
  let successRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const existing = await db.xlvInventoryDevice.findUnique({
      where: { deviceSn: row.deviceSn },
    });
    if (existing && !["admin_stock", "pending_mgr_confirm"].includes(existing.status)) {
      skippedRows++;
      warnings.push(`${row.deviceSn}：非事业部库存，跳过`);
      continue;
    }
    await applyTransition(
      row.deviceSn,
      {
        status: "pending_mgr_confirm",
        managerName: row.managerName,
        operatorName: "",
        channel: row.channel ?? existing?.channel ?? null,
        deployedByRole: null,
      },
      {
        type: "allocate_to_manager",
        batchId,
        operatorUserId,
        meta: { managerName: row.managerName },
      }
    );
    successRows++;
  }

  return {
    batchId,
    totalRows: rows.length,
    successRows,
    skippedRows,
    errors: [],
    warnings,
  };
}

export async function confirmManagerReceipt(
  deviceSns: string[],
  managerName: string,
  operatorUserId: string
): Promise<InventoryImportResult> {
  const batchId = createBatchId();
  const warnings: string[] = [];
  let successRows = 0;
  let skippedRows = 0;

  for (const deviceSn of deviceSns) {
    const existing = await db.xlvInventoryDevice.findUnique({
      where: { deviceSn },
    });
    if (!existing || existing.status !== "pending_mgr_confirm") {
      skippedRows++;
      warnings.push(`${deviceSn}：非待确认状态，跳过`);
      continue;
    }
    if (existing.managerName.trim() !== managerName.trim()) {
      skippedRows++;
      warnings.push(`${deviceSn}：经理不匹配，跳过`);
      continue;
    }
    await applyTransition(
      deviceSn,
      {
        status: "manager_stock",
        managerName: existing.managerName,
        operatorName: "",
        deployedByRole: null,
      },
      { type: "confirm_manager_receipt", batchId, operatorUserId }
    );
    successRows++;
  }

  return {
    batchId,
    totalRows: deviceSns.length,
    successRows,
    skippedRows,
    errors: [],
    warnings,
  };
}

export async function importAllocateToSalesRows(
  rows: { deviceSn: string; operatorName: string }[],
  managerName: string,
  operatorUserId: string
): Promise<InventoryImportResult> {
  const batchId = createBatchId();
  const warnings: string[] = [];
  let successRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const existing = await db.xlvInventoryDevice.findUnique({
      where: { deviceSn: row.deviceSn },
    });
    if (!existing || existing.status !== "manager_stock") {
      skippedRows++;
      warnings.push(`${row.deviceSn}：不在经理库存，跳过`);
      continue;
    }
    if (existing.managerName.trim() !== managerName.trim()) {
      skippedRows++;
      warnings.push(`${row.deviceSn}：非本经理库存，跳过`);
      continue;
    }
    const selfSale = isManagerSelfSaleRule({
      operatorName: row.operatorName,
      managerName,
    });
    if (selfSale) {
      skippedRows++;
      warnings.push(`${row.deviceSn}：经理自营无需分货，跳过`);
      continue;
    }
    await applyTransition(
      row.deviceSn,
      {
        status: "sales_stock",
        managerName,
        operatorName: row.operatorName,
        deployedByRole: null,
      },
      {
        type: "allocate_to_sales",
        batchId,
        operatorUserId,
        meta: { operatorName: row.operatorName },
      }
    );
    successRows++;
  }

  return {
    batchId,
    totalRows: rows.length,
    successRows,
    skippedRows,
    errors: [],
    warnings,
  };
}

export async function importOpeningBalanceRows(
  rows: {
    deviceSn: string;
    channel: string | null;
    managerName: string;
    operatorName: string;
  }[],
  operatorUserId: string,
  opts?: { dryRun?: boolean }
): Promise<InventoryImportResult & { deployedCount: number; stockCount: number }> {
  const batchId = createBatchId();
  const warnings: string[] = [];
  let successRows = 0;
  let skippedRows = 0;
  let deployedCount = 0;
  let stockCount = 0;

  const attributionSns = await loadSnAttributionSet();

  const planned = rows.map((row) => {
    const inSnAttribution = attributionSns.has(row.deviceSn);
    const status = openingStatusForRow(
      row.managerName,
      row.operatorName,
      inSnAttribution
    );
    return { row, inSnAttribution, status };
  });

  for (const { status } of planned) {
    if (status === "deployed") deployedCount++;
    else stockCount++;
  }

  if (opts?.dryRun) {
    successRows = rows.length;
    return {
      batchId,
      totalRows: rows.length,
      successRows,
      skippedRows,
      errors: [],
      warnings,
      deployedCount,
      stockCount,
    };
  }

  const indexes = await buildUserLookupIndexes();
  await ensureInventoryDeviceRecords(rows);

  for (const { row, inSnAttribution, status } of planned) {
    const deployedByRole =
      status === "deployed"
        ? inferDeployedByRole(row.managerName, row.operatorName)
        : null;

    await applyTransition(
      row.deviceSn,
      {
        status,
        managerName: row.managerName,
        operatorName: row.operatorName,
        channel: row.channel,
        deployedByRole,
        deployedAt: status === "deployed" ? new Date() : null,
      },
      {
        type: "opening_balance",
        batchId,
        operatorUserId,
        note: inSnAttribution ? "期初：在SN归属表" : "期初：库存",
      },
      { indexes }
    );
    successRows++;
  }

  return {
    batchId,
    totalRows: rows.length,
    successRows,
    skippedRows,
    errors: [],
    warnings,
    deployedCount,
    stockCount,
  };
}

export async function importWithdrawRows(
  rows: {
    deviceSn: string;
    operatorName: string;
    managerName: string;
    storeName: string | null;
  }[],
  operatorUserId: string,
  opts: {
    isAdmin: boolean;
    managerScope: string | null;
  }
): Promise<InventoryImportResult> {
  const batchId = createBatchId();
  const warnings: string[] = [];
  let successRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const existing = await db.xlvInventoryDevice.findUnique({
      where: { deviceSn: row.deviceSn },
    });

    if (!opts.isAdmin && opts.managerScope) {
      const scope = opts.managerScope.trim();
      if (row.managerName.trim() !== scope) {
        skippedRows++;
        warnings.push(`${row.deviceSn}：非本团队，跳过`);
        continue;
      }
    }

    if (!existing) {
      skippedRows++;
      warnings.push(`${row.deviceSn}：无库存记录，跳过（请先期初或入库）`);
      continue;
    }

    if (existing.status !== "deployed") {
      skippedRows++;
      warnings.push(`${row.deviceSn}：非已铺设状态，跳过`);
      continue;
    }

    const returnStatus = xlvWithdrawReturnStatus(existing.deployedByRole);
    const returnOperator =
      returnStatus === "sales_stock"
        ? existing.operatorName
        : isXlvManagerSelfSale(existing.managerName, existing.operatorName)
          ? existing.managerName
          : "";

    await applyTransition(
      row.deviceSn,
      {
        status: returnStatus,
        managerName: existing.managerName,
        operatorName: returnOperator,
        deployedByRole: null,
        deployedStoreName: null,
        deployedAt: null,
      },
      {
        type: "withdraw",
        batchId,
        operatorUserId,
        note: row.storeName ? `移机：${row.storeName}` : "移机撤机",
        meta: {
          withdrawManager: row.managerName,
          withdrawOperator: row.operatorName,
          storeName: row.storeName,
        },
      }
    );
    successRows++;
  }

  return {
    batchId,
    totalRows: rows.length,
    successRows,
    skippedRows,
    errors: [],
    warnings,
  };
}

export async function markDeployedFromOps(
  deviceSn: string,
  managerName: string,
  operatorName: string,
  operatorUserId: string
) {
  const existing = await db.xlvInventoryDevice.findUnique({
    where: { deviceSn },
  });
  if (!existing || existing.status === "deployed") return;
  if (!["manager_stock", "sales_stock"].includes(existing.status)) return;

  const deployedByRole = inferDeployedByRole(managerName, operatorName);
  await applyTransition(
    deviceSn,
    {
      status: "deployed",
      managerName,
      operatorName,
      deployedByRole,
      deployedAt: new Date(),
    },
    {
      type: "deploy",
      batchId: createBatchId(),
      operatorUserId,
      note: "运营导入自动铺设",
    }
  );
}

export async function getInventorySummary(forManagerName?: string | null) {
  const where = forManagerName?.trim()
    ? { managerName: forManagerName.trim() }
    : {};

  const grouped = await db.xlvInventoryDevice.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const counts: Record<XlvInventoryStatus, number> = {
    admin_stock: 0,
    pending_mgr_confirm: 0,
    manager_stock: 0,
    sales_stock: 0,
    deployed: 0,
  };
  for (const g of grouped) {
    counts[g.status] = g._count._all;
  }

  const pendingReceipt = forManagerName?.trim()
    ? await db.xlvInventoryDevice.count({
        where: {
          status: "pending_mgr_confirm",
          managerName: forManagerName.trim(),
        },
      })
    : await db.xlvInventoryDevice.count({
        where: { status: "pending_mgr_confirm" },
      });

  return { counts, pendingReceipt, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export type InventoryManagerReportRow = {
  managerName: string;
  /** 物流账在册总数（期初/划拨入账） */
  ledgerTotal: number;
  deployed: number;
  stockRemaining: number;
  managerStock: number;
  salesStock: number;
  pendingReceipt: number;
  /** 已铺设 / 在册，百分比 */
  deployRate: number;
  /** 运营考核合规率（已铺设设备）；无运营数据时为 null */
  complianceRate: number | null;
  complianceDeviceCount: number;
  complianceCompliantCount: number;
  complianceGapCount: number;
};

export function enrichManagerReportWithCompliance(
  rows: InventoryManagerReportRow[],
  complianceByName: Map<
    string,
    {
      complianceRate: number;
      compliantCount: number;
      deviceCount: number;
      complianceGapCount: number;
    }
  >
): InventoryManagerReportRow[] {
  return rows.map((row) => {
    const c = complianceByName.get(row.managerName.trim());
    return {
      ...row,
      complianceRate: c?.complianceRate ?? null,
      complianceDeviceCount: c?.deviceCount ?? 0,
      complianceCompliantCount: c?.compliantCount ?? 0,
      complianceGapCount: c?.complianceGapCount ?? 0,
    };
  });
}

export type InventoryStaffReportRow = {
  operatorName: string;
  salesStock: number;
};

export async function loadInventoryManagerReport(
  forManagerName?: string | null
): Promise<InventoryManagerReportRow[]> {
  const scope = forManagerName?.trim();
  const grouped = await db.xlvInventoryDevice.groupBy({
    by: ["managerName", "status"],
    where: {
      managerName: scope ? scope : { not: "" },
    },
    _count: { _all: true },
  });

  const map = new Map<string, InventoryManagerReportRow>();
  for (const g of grouped) {
    const name = g.managerName.trim();
    if (!name) continue;
    const row = map.get(name) ?? {
      managerName: name,
      ledgerTotal: 0,
      deployed: 0,
      stockRemaining: 0,
      managerStock: 0,
      salesStock: 0,
      pendingReceipt: 0,
      deployRate: 0,
      complianceRate: null,
      complianceDeviceCount: 0,
      complianceCompliantCount: 0,
      complianceGapCount: 0,
    };
    const c = g._count._all;
    row.ledgerTotal += c;
    if (g.status === "deployed") row.deployed += c;
    if (g.status === "manager_stock") {
      row.managerStock += c;
      row.stockRemaining += c;
    }
    if (g.status === "sales_stock") {
      row.salesStock += c;
      row.stockRemaining += c;
    }
    if (g.status === "pending_mgr_confirm") {
      row.pendingReceipt += c;
      row.stockRemaining += c;
    }
    map.set(name, row);
  }

  const rows = [...map.values()];
  for (const row of rows) {
    row.deployRate =
      row.ledgerTotal > 0
        ? Math.round((row.deployed / row.ledgerTotal) * 1000) / 10
        : 0;
  }
  return rows.sort(
    (a, b) =>
      b.stockRemaining - a.stockRemaining ||
      b.ledgerTotal - a.ledgerTotal
  );
}

export async function loadInventoryStaffReport(
  managerName: string
): Promise<InventoryStaffReportRow[]> {
  const grouped = await db.xlvInventoryDevice.groupBy({
    by: ["operatorName"],
    where: {
      managerName: managerName.trim(),
      status: "sales_stock",
      operatorName: { not: "" },
    },
    _count: { _all: true },
  });
  return grouped
    .map((g) => ({
      operatorName: g.operatorName.trim(),
      salesStock: g._count._all,
    }))
    .filter((r) => r.operatorName)
    .sort((a, b) => b.salesStock - a.salesStock);
}

export type InventoryOverview = {
  scopeSummary: {
    ledgerTotal: number;
    deployed: number;
    stockRemaining: number;
    deployRate: number;
    /** 范围内经理运营设备加权合规率 */
    complianceRate: number | null;
    adminStock: number;
    pendingReceipt: number;
  };
  managers: InventoryManagerReportRow[];
  staff?: InventoryStaffReportRow[];
};

export type InventoryLedgerTotals = {
  adminStock: number;
  managerStock: number;
  salesStock: number;
  pendingReceipt: number;
  hasLedger: boolean;
};

export type InventoryManagerCounts = {
  managerStock: number;
  salesStock: number;
  pendingReceipt: number;
};

export async function loadInventoryLedgerTotals(): Promise<InventoryLedgerTotals> {
  const grouped = await db.xlvInventoryDevice.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;

  const adminStock = counts.admin_stock ?? 0;
  const managerStock = counts.manager_stock ?? 0;
  const salesStock = counts.sales_stock ?? 0;
  const pendingReceipt = counts.pending_mgr_confirm ?? 0;
  const stockTotal = adminStock + managerStock + salesStock + pendingReceipt;

  return {
    adminStock,
    managerStock,
    salesStock,
    pendingReceipt,
    hasLedger: stockTotal > 0,
  };
}

export async function loadInventoryCountsByManager() {
  const grouped = await db.xlvInventoryDevice.groupBy({
    by: ["managerName", "status"],
    where: {
      status: { in: ["manager_stock", "sales_stock", "pending_mgr_confirm"] },
      managerName: { not: "" },
    },
    _count: { _all: true },
  });

  const map = new Map<string, InventoryManagerCounts>();
  for (const row of grouped) {
    const name = row.managerName.trim();
    if (!name) continue;
    const entry = map.get(name) ?? {
      managerStock: 0,
      salesStock: 0,
      pendingReceipt: 0,
    };
    if (row.status === "manager_stock") entry.managerStock += row._count._all;
    if (row.status === "sales_stock") entry.salesStock += row._count._all;
    if (row.status === "pending_mgr_confirm") {
      entry.pendingReceipt += row._count._all;
    }
    map.set(name, entry);
  }
  return map;
}

export async function loadInventorySalesStockByOperator(managerName: string) {
  const grouped = await db.xlvInventoryDevice.groupBy({
    by: ["operatorName"],
    where: {
      managerName: managerName.trim(),
      status: "sales_stock",
      operatorName: { not: "" },
    },
    _count: { _all: true },
  });

  const map = new Map<string, number>();
  for (const row of grouped) {
    const name = row.operatorName.trim();
    if (name) map.set(name, row._count._all);
  }
  return map;
}

export async function listPendingReceipts(managerName: string) {
  return db.xlvInventoryDevice.findMany({
    where: {
      status: "pending_mgr_confirm",
      managerName: managerName.trim(),
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
}
