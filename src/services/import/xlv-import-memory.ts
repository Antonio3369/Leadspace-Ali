/**
 * 小绿盒运营原始表（raw）重导入：内存护栏与 GC 辅助。
 * 午后 warm 进程 ~1.2–1.4GB 属正常，须在此时仍能开始导入；仅在接近 cgroup 上限前主动中止。
 */

export const XLV_IMPORT_MAX_DATA_ROWS = Number(
  process.env.XLV_IMPORT_MAX_DATA_ROWS ?? "30000"
);

/** 主动中止线：低于容器 2G 与运维 health 重启线 1920MB */
export const XLV_IMPORT_MEM_ABORT_MB = Number(
  process.env.XLV_IMPORT_MEM_ABORT_MB ?? "1850"
);

export const XLV_IMPORT_REUPLOAD_MSG =
  "导入已中止，请重新上传。";

/** 未收紧 !ref 时仍声明超大矩形（常见「格式刷到第 104 万行」） */
const UNTRIMMED_SHEET_ROW_REJECT = 50_000;

export class XlvImportAbortedError extends Error {
  constructor(message: string = XLV_IMPORT_REUPLOAD_MSG) {
    super(message);
    this.name = "XlvImportAbortedError";
  }
}

export function maybeGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc === "function") gc();
}

export function rssMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

/** 先 GC 再读 RSS，供导入中的内存判断 */
export function rssMbAfterGc(): number {
  maybeGc();
  return rssMb();
}

export function isImportMemoryOverLimit(rssMbValue: number): boolean {
  return rssMbValue >= XLV_IMPORT_MEM_ABORT_MB;
}

export function checkImportMemoryOrAbort(): void {
  const used = rssMbAfterGc();
  if (isImportMemoryOverLimit(used)) {
    throw new XlvImportAbortedError(
      `内存占用过高（约 ${used}MB），${XLV_IMPORT_REUPLOAD_MSG}`
    );
  }
}

export function yieldImportTick(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

export type SheetRowGuardResult =
  | { ok: true; dataRows: number }
  | { ok: false; message: string };

/** 解析前检查 sheet 有效数据行数（row 0 为表头，dataRows = 末行索引） */
export function guardSheetDataRows(
  dataRows: number,
  refTightened: boolean
): SheetRowGuardResult {
  if (dataRows > XLV_IMPORT_MAX_DATA_ROWS) {
    return {
      ok: false,
      message: `工作表数据行约 ${dataRows.toLocaleString()} 行，超过上限 ${XLV_IMPORT_MAX_DATA_ROWS.toLocaleString()} 行，请缩小后重新上传。`,
    };
  }
  if (!refTightened && dataRows > UNTRIMMED_SHEET_ROW_REJECT) {
    return {
      ok: false,
      message: `工作表声明范围过大（约 ${dataRows.toLocaleString()} 行），可能含无数据的格式行。请在渠道后台导出纯数据表后重新上传。`,
    };
  }
  return { ok: true, dataRows };
}
