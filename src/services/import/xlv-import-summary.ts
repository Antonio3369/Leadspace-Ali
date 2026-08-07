export type XlvImportColumnStatus = {
  id: string;
  label: string;
  matched: boolean;
  matchedHeader?: string;
};

export type XlvImportSummary = {
  format: "raw" | "personnel";
  sheetName: string;
  columns: XlvImportColumnStatus[];
  /** Excel 有效数据行（含重复 SN+日期） */
  rawRowsInFile: number;
  uniqueDevices: number;
  statDateRange?: { min: string; max: string };
  snapshotsWritten: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  /** 同一 SN+日历日多行，文件内合并 */
  fileDuplicateRowsCollapsed: number;
  /** 库内同日重复快照删除 */
  duplicateSnapshotsRemoved: number;
  devicesCreated: number;
  devicesUpdated: number;
  /** 人员表：系统内未匹配到的姓名 */
  unmatchedManagers: string[];
  unmatchedOperators: string[];
  warnings: string[];
};

function headerLabel(headers: string[], idx: number) {
  return idx >= 0 ? headers[idx] : undefined;
}

export function buildXlvRawColumnMeta(
  headers: string[],
  idx: Record<
    | "sn"
    | "stat"
    | "users"
    | "txns"
    | "amount"
    | "dailyUsers"
    | "dailyTxns"
    | "dailyAmount",
    number
  >
): XlvImportColumnStatus[] {
  return [
    { id: "sn", label: "设备 SN", matched: idx.sn >= 0, matchedHeader: headerLabel(headers, idx.sn) },
    {
      id: "stat",
      label: "统计日期",
      matched: idx.stat >= 0,
      matchedHeader: headerLabel(headers, idx.stat),
    },
    {
      id: "users",
      label: "累计交易用户数",
      matched: idx.users >= 0,
      matchedHeader: headerLabel(headers, idx.users),
    },
    {
      id: "txns",
      label: "累计有效交易笔数",
      matched: idx.txns >= 0,
      matchedHeader: headerLabel(headers, idx.txns),
    },
    {
      id: "amount",
      label: "累计有效交易金额",
      matched: idx.amount >= 0,
      matchedHeader: headerLabel(headers, idx.amount),
    },
    {
      id: "dailyUsers",
      label: "当日交易用户数",
      matched: idx.dailyUsers >= 0,
      matchedHeader: headerLabel(headers, idx.dailyUsers),
    },
    {
      id: "dailyTxns",
      label: "当日有效交易笔数",
      matched: idx.dailyTxns >= 0,
      matchedHeader: headerLabel(headers, idx.dailyTxns),
    },
    {
      id: "dailyAmount",
      label: "当日有效交易金额",
      matched: idx.dailyAmount >= 0,
      matchedHeader: headerLabel(headers, idx.dailyAmount),
    },
  ];
}

export function buildXlvPersonnelColumnMeta(
  headers: string[],
  idx: Record<
    "sn" | "stat" | "operator" | "manager" | "merchant" | "users" | "txns",
    number
  >
): XlvImportColumnStatus[] {
  return [
    { id: "sn", label: "设备 SN", matched: idx.sn >= 0, matchedHeader: headerLabel(headers, idx.sn) },
    {
      id: "operator",
      label: "所属作业员",
      matched: idx.operator >= 0,
      matchedHeader: headerLabel(headers, idx.operator),
    },
    {
      id: "manager",
      label: "所属经理",
      matched: idx.manager >= 0,
      matchedHeader: headerLabel(headers, idx.manager),
    },
    {
      id: "merchant",
      label: "商户名称",
      matched: idx.merchant >= 0,
      matchedHeader: headerLabel(headers, idx.merchant),
    },
    {
      id: "users",
      label: "累计交易用户数",
      matched: idx.users >= 0,
      matchedHeader: headerLabel(headers, idx.users),
    },
    {
      id: "txns",
      label: "累计有效交易笔数",
      matched: idx.txns >= 0,
      matchedHeader: headerLabel(headers, idx.txns),
    },
    {
      id: "stat",
      label: "统计日期",
      matched: idx.stat >= 0,
      matchedHeader: headerLabel(headers, idx.stat),
    },
  ];
}
