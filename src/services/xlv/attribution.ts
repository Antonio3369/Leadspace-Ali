import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  isXlvManagerAttributionMissing,
  isXlvManagerSelfSale,
  isXlvOperatorAttributionMissing,
  isXlvOperatorNotInRoster,
  isXlvPlaceholderName,
} from "@/lib/xlv-rules";
import { buildXlvAssignedDeviceWhere } from "@/services/xlv/xlv-scope";
import {
  buildXlvRosterPairSet,
  loadXlvRosterEntries,
} from "@/services/xlv/roster";

export type XlvUnmatchedNameRow = {
  name: string;
  deviceCount: number;
  managerName?: string;
};

export type XlvUnattachedDeviceRow = {
  deviceSn: string;
  merchantName: string | null;
  operatorName: string;
  managerName: string;
  missingManager: boolean;
  missingOperator: boolean;
  notInRoster: boolean;
  managerSelfSale: boolean;
  operatorHint: string | null;
};

function enrichUnattachedRow(
  row: {
    deviceSn: string;
    merchantName: string | null;
    operatorName: string;
    managerName: string;
  },
  rosterPairs: ReadonlySet<string>
): XlvUnattachedDeviceRow {
  const managerName = row.managerName?.trim() ?? "";
  const operatorName = row.operatorName?.trim() ?? "";
  const managerSelfSale = isXlvManagerSelfSale({ operatorName, managerName });
  const missingManager = isXlvManagerAttributionMissing({ managerName });
  const missingOperator = isXlvOperatorAttributionMissing({
    operatorName,
    managerName,
  });
  const notInRoster = isXlvOperatorNotInRoster(
    { operatorName, managerName },
    rosterPairs
  );

  let operatorHint: string | null = null;
  if (managerSelfSale) {
    operatorHint = "经理自营拓展";
  } else if (missingOperator) {
    operatorHint = isXlvPlaceholderName(operatorName)
      ? "队员为占位或未填写（如「待定」）"
      : "缺少队员姓名";
  } else if (notInRoster) {
    operatorHint = "该队员+经理组合不在组织名册中";
  }

  return {
    deviceSn: row.deviceSn,
    merchantName: row.merchantName,
    operatorName: row.operatorName,
    managerName: row.managerName,
    missingManager,
    missingOperator,
    notInRoster,
    managerSelfSale,
    operatorHint,
  };
}

export async function getXlvAttributionReport() {
  const [devices, rosterEntries] = await Promise.all([
    db.xlvDeviceRecord.findMany({
      where: buildXlvAssignedDeviceWhere(),
      select: {
        operatorName: true,
        managerName: true,
      },
    }),
    loadXlvRosterEntries(),
  ]);
  const rosterPairs = buildXlvRosterPairSet(rosterEntries);

  const missingManagerNames = new Map<string, number>();
  const missingOperatorNames = new Map<
    string,
    { operatorName: string; managerName: string; count: number }
  >();
  const notInRosterOperators = new Map<
    string,
    { operatorName: string; managerName: string; count: number }
  >();

  let devicesMissingManager = 0;
  let devicesMissingOperator = 0;
  let devicesNotInRoster = 0;

  for (const d of devices) {
    const managerName = d.managerName?.trim() ?? "";
    const operatorName = d.operatorName?.trim() ?? "";

    if (isXlvManagerAttributionMissing({ managerName })) {
      devicesMissingManager += 1;
      missingManagerNames.set(
        managerName || "（空）",
        (missingManagerNames.get(managerName || "（空）") ?? 0) + 1
      );
    }

    if (
      isXlvOperatorAttributionMissing({ operatorName, managerName })
    ) {
      devicesMissingOperator += 1;
      const key = `${managerName}::${operatorName || "（空）"}`;
      const prev = missingOperatorNames.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        missingOperatorNames.set(key, {
          operatorName: operatorName || "（空）",
          managerName,
          count: 1,
        });
      }
    }

    if (isXlvOperatorNotInRoster({ operatorName, managerName }, rosterPairs)) {
      devicesNotInRoster += 1;
      const key = `${managerName}::${operatorName}`;
      const prev = notInRosterOperators.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        notInRosterOperators.set(key, {
          operatorName,
          managerName,
          count: 1,
        });
      }
    }
  }

  return {
    summary: {
      assignedDevices: devices.length,
      devicesMissingManagerId: devicesMissingManager,
      devicesMissingSalesId: devicesMissingOperator,
      devicesNotInRoster,
      unmatchedManagerNames: missingManagerNames.size,
      unmatchedOperatorNames:
        missingOperatorNames.size + notInRosterOperators.size,
    },
    unmatchedManagers: [...missingManagerNames.entries()]
      .map(([name, deviceCount]) => ({ name, deviceCount }))
      .sort((a, b) => b.deviceCount - a.deviceCount || a.name.localeCompare(b.name)),
    unmatchedOperators: [
      ...missingOperatorNames.values(),
      ...notInRosterOperators.values(),
    ]
      .map((row) => ({
        name: row.operatorName,
        managerName: row.managerName,
        deviceCount: row.count,
      }))
      .sort(
        (a, b) =>
          b.deviceCount - a.deviceCount ||
          a.managerName.localeCompare(b.managerName) ||
          a.name.localeCompare(b.name)
      ),
  };
}

function buildUnattachedWhere(opts: {
  q?: string;
  missing?: "manager" | "operator" | "any";
}): Prisma.XlvDeviceRecordWhereInput {
  const parts: Prisma.XlvDeviceRecordWhereInput[] = [
    buildXlvAssignedDeviceWhere(),
  ];

  const q = opts.q?.trim();
  if (q) {
    parts.push({
      OR: [
        { deviceSn: { contains: q, mode: "insensitive" } },
        { merchantName: { contains: q, mode: "insensitive" } },
        { operatorName: { contains: q, mode: "insensitive" } },
        { managerName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: parts };
}

export async function getXlvUnattachedDevices(opts: {
  q?: string;
  missing?: "manager" | "operator" | "any";
  limit?: number;
  offset?: number;
}) {
  const where = buildUnattachedWhere(opts);
  const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const skip = Math.max(opts.offset ?? 0, 0);

  const [rows, rosterEntries] = await Promise.all([
    db.xlvDeviceRecord.findMany({
      where,
      orderBy: [{ managerName: "asc" }, { operatorName: "asc" }, { deviceSn: "asc" }],
      select: {
        deviceSn: true,
        merchantName: true,
        operatorName: true,
        managerName: true,
      },
    }),
    loadXlvRosterEntries(),
  ]);

  const rosterPairs = buildXlvRosterPairSet(rosterEntries);
  const enriched = rows.map((row) => enrichUnattachedRow(row, rosterPairs));
  const filtered = enriched.filter((d) => {
    if (opts.missing === "manager") return d.missingManager;
    if (opts.missing === "operator") {
      return d.missingOperator || d.notInRoster;
    }
    return d.missingManager || d.missingOperator || d.notInRoster;
  });

  const total = filtered.length;
  const devices = filtered.slice(skip, skip + take);

  return { total, devices };
}

export async function getXlvAttributionLookup() {
  const roster = await loadXlvRosterEntries();
  const managers = [...new Set(roster.map((r) => r.managerName.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "zh-CN")
  );
  const operators = [...new Set(roster.map((r) => r.operatorName.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "zh-CN")
  );
  return { managers, operators, roster };
}

export async function updateXlvDeviceAttribution(
  deviceSn: string,
  data: {
    managerName?: string;
    operatorName?: string;
  }
) {
  const existing = await db.xlvDeviceRecord.findUnique({
    where: { deviceSn },
    select: { deviceSn: true, salesUserId: true, managerUserId: true },
  });
  if (!existing) throw new Error("设备不存在");

  const patch: Prisma.XlvDeviceRecordUpdateInput = {};
  if (existing.salesUserId) patch.salesUser = { disconnect: true };
  if (existing.managerUserId) patch.managerUser = { disconnect: true };

  if (data.managerName !== undefined) {
    patch.managerName = data.managerName.trim();
  }
  if (data.operatorName !== undefined) {
    patch.operatorName = data.operatorName.trim();
  }

  return db.xlvDeviceRecord.update({
    where: { deviceSn },
    data: patch,
    select: {
      deviceSn: true,
      operatorName: true,
      managerName: true,
      salesUserId: true,
      managerUserId: true,
    },
  });
}
