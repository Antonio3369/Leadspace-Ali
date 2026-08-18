import * as XLSX from "xlsx";

function normalizeHeader(header: string) {
  return String(header).replace(/\r/g, "").trim();
}

function findColumn(headers: string[], candidates: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const c of candidates) {
    const idx = normalized.findIndex(
      (h) => h === c || h.includes(c) || c.includes(h)
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseExcelDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400000);
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ParsedInboundRow = { deviceSn: string; channel: string | null; rowIndex: number };
export type ParsedAllocateManagerRow = {
  deviceSn: string;
  managerName: string;
  channel: string | null;
  rowIndex: number;
};
export type ParsedAllocateSalesRow = {
  deviceSn: string;
  operatorName: string;
  rowIndex: number;
};
export type ParsedOpeningRow = {
  deviceSn: string;
  channel: string | null;
  managerName: string;
  operatorName: string;
  rowIndex: number;
};
export type ParsedWithdrawRow = {
  deviceSn: string;
  entryDate: Date | null;
  operatorName: string;
  managerName: string;
  storeName: string | null;
  rowIndex: number;
};

function readSheetRows(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { sheetName: "", rows: [] as Record<string, unknown>[], headers: [] as string[] };
  }
  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });
  const headers =
    rows.length > 0
      ? Object.keys(rows[0]!)
      : (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[]) ?? [];
  return { sheetName, rows, headers: headers.map(String) };
}

export function parseInboundExcel(buffer: Buffer) {
  const { sheetName, rows, headers } = readSheetRows(buffer);
  const snIdx = findColumn(headers, ["设备SN", "SN", "设备SN 号扫一扫"]);
  const channelIdx = findColumn(headers, ["渠道"]);
  const errors: string[] = [];
  const parsed: ParsedInboundRow[] = [];

  if (snIdx < 0) {
    return { sheetName, rows: parsed, errors: ["缺少列：设备SN"] };
  }

  rows.forEach((row, i) => {
    const values = Object.values(row);
    const deviceSn = String(values[snIdx] ?? "").trim();
    if (!deviceSn) return;
    parsed.push({
      deviceSn,
      channel:
        channelIdx >= 0 ? String(values[channelIdx] ?? "").trim() || null : null,
      rowIndex: i + 2,
    });
  });

  return { sheetName, rows: parsed, errors };
}

export function parseAllocateManagerExcel(buffer: Buffer) {
  const { sheetName, rows, headers } = readSheetRows(buffer);
  const snIdx = findColumn(headers, ["设备SN", "SN", "设备SN 号扫一扫"]);
  const mgrIdx = findColumn(headers, ["所属经理", "经理"]);
  const channelIdx = findColumn(headers, ["渠道"]);
  const parsed: ParsedAllocateManagerRow[] = [];

  if (snIdx < 0 || mgrIdx < 0) {
    return { sheetName, rows: parsed, errors: ["缺少列：设备SN 或 所属经理"] };
  }

  rows.forEach((row, i) => {
    const values = Object.values(row);
    const deviceSn = String(values[snIdx] ?? "").trim();
    const managerName = String(values[mgrIdx] ?? "").trim();
    if (!deviceSn || !managerName) return;
    parsed.push({
      deviceSn,
      managerName,
      channel:
        channelIdx >= 0 ? String(values[channelIdx] ?? "").trim() || null : null,
      rowIndex: i + 2,
    });
  });

  return { sheetName, rows: parsed, errors: [] as string[] };
}

export function parseAllocateSalesExcel(buffer: Buffer) {
  const { sheetName, rows, headers } = readSheetRows(buffer);
  const snIdx = findColumn(headers, ["设备SN", "SN", "设备SN 号扫一扫"]);
  const opIdx = findColumn(headers, ["作业员", "所属业务员", "所属作业员"]);
  const parsed: ParsedAllocateSalesRow[] = [];

  if (snIdx < 0 || opIdx < 0) {
    return { sheetName, rows: parsed, errors: ["缺少列：设备SN 或 作业员"] };
  }

  rows.forEach((row, i) => {
    const values = Object.values(row);
    const deviceSn = String(values[snIdx] ?? "").trim();
    const operatorName = String(values[opIdx] ?? "").trim();
    if (!deviceSn || !operatorName) return;
    parsed.push({
      deviceSn,
      operatorName,
      rowIndex: i + 2,
    });
  });

  return { sheetName, rows: parsed, errors: [] as string[] };
}

export function parseOpeningExcel(buffer: Buffer) {
  const { sheetName, rows, headers } = readSheetRows(buffer);
  const snIdx = findColumn(headers, ["设备SN", "SN", "设备SN 号扫一扫"]);
  const channelIdx = findColumn(headers, ["渠道"]);
  const mgrIdx = findColumn(headers, ["所属经理", "经理"]);
  const opIdx = findColumn(headers, ["作业员", "所属业务员", "所属作业员"]);
  const parsed: ParsedOpeningRow[] = [];

  if (snIdx < 0 || mgrIdx < 0) {
    return { sheetName, rows: parsed, errors: ["缺少列：设备SN 或 所属经理"] };
  }

  rows.forEach((row, i) => {
    const values = Object.values(row);
    const deviceSn = String(values[snIdx] ?? "").trim();
    const managerName = String(values[mgrIdx] ?? "").trim();
    if (!deviceSn || !managerName) return;
    parsed.push({
      deviceSn,
      channel:
        channelIdx >= 0 ? String(values[channelIdx] ?? "").trim() || null : null,
      managerName,
      operatorName: opIdx >= 0 ? String(values[opIdx] ?? "").trim() : "",
      rowIndex: i + 2,
    });
  });

  return { sheetName, rows: parsed, errors: [] as string[] };
}

export function parseWithdrawExcel(buffer: Buffer) {
  const { sheetName, rows, headers } = readSheetRows(buffer);
  const snIdx = findColumn(headers, ["设备SN 号扫一扫", "设备SN", "SN"]);
  const dateIdx = findColumn(headers, ["进件日期"]);
  const opIdx = findColumn(headers, ["所属业务员", "作业员", "所属作业员"]);
  const mgrIdx = findColumn(headers, ["所属经理", "经理"]);
  const storeIdx = findColumn(headers, ["门店名称", "门店"]);
  const parsed: ParsedWithdrawRow[] = [];

  if (snIdx < 0) {
    return { sheetName, rows: parsed, errors: ["缺少列：设备SN"] };
  }

  rows.forEach((row, i) => {
    const values = Object.values(row);
    const deviceSn = String(values[snIdx] ?? "").trim();
    if (!deviceSn) return;
    parsed.push({
      deviceSn,
      entryDate: dateIdx >= 0 ? parseExcelDate(values[dateIdx]) : null,
      operatorName: opIdx >= 0 ? String(values[opIdx] ?? "").trim() : "",
      managerName: mgrIdx >= 0 ? String(values[mgrIdx] ?? "").trim() : "",
      storeName:
        storeIdx >= 0 ? String(values[storeIdx] ?? "").trim() || null : null,
      rowIndex: i + 2,
    });
  });

  return { sheetName, rows: parsed, errors: [] as string[] };
}

/** 移机表同 SN 多行：取进件日期最新一条 */
export function dedupeWithdrawRows(rows: ParsedWithdrawRow[]) {
  const map = new Map<string, ParsedWithdrawRow>();
  for (const row of rows) {
    const prev = map.get(row.deviceSn);
    if (!prev) {
      map.set(row.deviceSn, row);
      continue;
    }
    const prevTime = prev.entryDate?.getTime() ?? 0;
    const nextTime = row.entryDate?.getTime() ?? 0;
    if (nextTime >= prevTime) map.set(row.deviceSn, row);
  }
  return [...map.values()];
}

/** 期初表同 SN 多行：优先作业员非空，否则最后一条 */
export function dedupeOpeningRows(rows: ParsedOpeningRow[]) {
  const map = new Map<string, ParsedOpeningRow>();
  for (const row of rows) {
    const prev = map.get(row.deviceSn);
    if (!prev) {
      map.set(row.deviceSn, row);
      continue;
    }
    const prevHasOp = Boolean(prev.operatorName.trim());
    const nextHasOp = Boolean(row.operatorName.trim());
    if (!prevHasOp && nextHasOp) {
      map.set(row.deviceSn, row);
    } else if (prevHasOp === nextHasOp) {
      map.set(row.deviceSn, row);
    }
  }
  return [...map.values()];
}
