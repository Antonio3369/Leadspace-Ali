import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import {
  normalizeXlvStatDate,
  parseXlvStatDateFromCell,
  xlvStatDateKey,
} from "@/lib/xlv-stat-date";

const NB_HYPHEN = "\u2011";

function isoDay(value: Date | null | undefined): string {
  return value?.toISOString().slice(0, 10) ?? "";
}

describe("parseXlvStatDateFromCell", () => {
  it("accepts ASCII YYYY-MM-DD", () => {
    assert.equal(isoDay(parseXlvStatDateFromCell("2026-11-17")), "2026-11-17");
  });

  it("accepts non-breaking hyphen (U+2011) formatted dates", () => {
    const raw = `2026${NB_HYPHEN}11${NB_HYPHEN}17`;
    assert.equal(isoDay(parseXlvStatDateFromCell(raw)), "2026-11-17");
  });

  it("accepts en-dash and fullwidth hyphen lookalikes", () => {
    assert.equal(isoDay(parseXlvStatDateFromCell("2026\u201311\u201417")), "2026-11-17");
    assert.equal(isoDay(parseXlvStatDateFromCell("2026\uFF0D11\uFF0D17")), "2026-11-17");
    assert.equal(isoDay(parseXlvStatDateFromCell("2026\u201211\u201517")), "2026-11-17");
  });

  it("keeps YYYYMMDD and Excel serial numbers", () => {
    assert.equal(isoDay(parseXlvStatDateFromCell(20261117)), "2026-11-17");
    const serial = 46343;
    const fromSerial = XLSX.SSF.parse_date_code(serial);
    assert.ok(fromSerial);
    assert.equal(
      isoDay(parseXlvStatDateFromCell(serial)),
      `2026-11-${String(fromSerial!.d).padStart(2, "0")}`
    );
  });

  it("does not use UTC calendar day for SheetJS cellDates pitfall", () => {
    const sheetJs = new Date("2026-11-16T15:59:17.000Z");
    assert.equal(sheetJs.getUTCDate(), 16);
    assert.equal(isoDay(parseXlvStatDateFromCell(sheetJs)), "2026-11-17");
  });

  it("keeps midnight UTC Excel dates on the same calendar day", () => {
    assert.equal(
      isoDay(parseXlvStatDateFromCell(new Date("2026-11-17T00:00:00.000Z"))),
      "2026-11-17"
    );
  });

  it("matches prior Shanghai口径 for classic Aug 3/4 timezone edge via serial", () => {
    assert.equal(
      isoDay(parseXlvStatDateFromCell(new Date("2026-08-03T00:00:00.000Z"))),
      "2026-08-03"
    );
    assert.equal(
      isoDay(parseXlvStatDateFromCell(new Date("2026-08-03T16:00:00.000Z"))),
      xlvStatDateKey(new Date("2026-08-03T16:00:00.000Z")) === "2026-08-04"
        ? "2026-08-04"
        : "2026-08-03"
    );
  });
});

describe("normalizeXlvStatDate (unchanged helpers)", () => {
  it("still normalizes string inputs for storage", () => {
    assert.equal(
      normalizeXlvStatDate("2026-11-17").toISOString(),
      "2026-11-17T00:00:00.000Z"
    );
  });
});