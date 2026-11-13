import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  releaseImportLock,
  resetImportLock,
  tryAcquireImportLock,
} from "@/lib/import-lock";
import {
  guardSheetDataRows,
  isImportMemoryOverLimit,
  XLV_IMPORT_MAX_DATA_ROWS,
  XLV_IMPORT_MEM_ABORT_MB,
} from "@/services/import/xlv-import-memory";

describe("xlv-import-memory", () => {
  it("allows typical 付呗 scale and caps far above 11.12 files", () => {
    const ok = guardSheetDataRows(5110, true);
    assert.equal(ok.ok, true);
    const border = guardSheetDataRows(XLV_IMPORT_MAX_DATA_ROWS, true);
    assert.equal(border.ok, true);
  });

  it("rejects sheets beyond configured data-row cap", () => {
    const bad = guardSheetDataRows(XLV_IMPORT_MAX_DATA_ROWS + 1, true);
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.match(bad.message, /重新上传/);
    }
  });

  it("rejects untrimmed oversized sheet ref before materializing", () => {
    const bad = guardSheetDataRows(200_000, false);
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.match(bad.message, /重新上传/);
    }
    const painted = guardSheetDataRows(80_000, false);
    assert.equal(painted.ok, false);
  });

  it("treats warm afternoon RSS as safe to continue", () => {
    assert.equal(isImportMemoryOverLimit(1200), false);
    assert.equal(isImportMemoryOverLimit(1400), false);
    assert.equal(isImportMemoryOverLimit(XLV_IMPORT_MEM_ABORT_MB - 1), false);
  });

  it("aborts only near cgroup limit", () => {
    assert.equal(isImportMemoryOverLimit(XLV_IMPORT_MEM_ABORT_MB), true);
    assert.equal(isImportMemoryOverLimit(1900), true);
  });
});

describe("import-lock on fail", () => {
  it("releases lock after simulate-fail finally", () => {
    resetImportLock();
    assert.equal(tryAcquireImportLock("xlv"), true);
    try {
      throw new Error("模拟导入失败");
    } catch {
      /* ignore */
    } finally {
      releaseImportLock();
    }
    assert.equal(tryAcquireImportLock("xlv"), true);
    releaseImportLock();
  });
});
