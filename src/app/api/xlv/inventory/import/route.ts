import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionAuthRealm } from "@/lib/auth-realm";
import { canImportExcel, canLogin } from "@/lib/permissions";
import {
  dedupeOpeningRows,
  dedupeWithdrawRows,
  parseAllocateManagerExcel,
  parseAllocateSalesExcel,
  parseInboundExcel,
  parseOpeningExcel,
  parseRecallToAdminExcel,
  parseWithdrawExcel,
} from "@/services/xlv/inventory/parser";
import {
  importAllocateToManagerRows,
  importAllocateToSalesRows,
  importInboundRows,
  importOpeningBalanceRows,
  importRecallToAdminRows,
  importWithdrawRows,
} from "@/services/xlv/inventory/service";

export const maxDuration = 120;

const IMPORT_KINDS = [
  "inbound",
  "allocate-manager",
  "recall-to-admin",
  "allocate-sales",
  "withdraw",
  "opening",
] as const;

type ImportKind = (typeof IMPORT_KINDS)[number];

function parseKind(value: string | null): ImportKind | null {
  if (!value) return null;
  return IMPORT_KINDS.includes(value as ImportKind) ? (value as ImportKind) : null;
}

export const POST = auth(async (request) => {
  const user = request.auth?.user;
  if (!user || !canLogin(user.status)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const dryRun = url.searchParams.get("dryRun") === "1";

  if (!kind) {
    return NextResponse.json(
      { error: "缺少 kind：inbound | allocate-manager | recall-to-admin | allocate-sales | withdraw | opening" },
      { status: 400 }
    );
  }

  const realm = sessionAuthRealm(user);
  const managerName =
    user.role === "MANAGER"
      ? realm === "xlv"
        ? (user.xlvManagerName ?? user.name).trim()
        : user.name.trim()
      : "";

  const directorOnly = ["inbound", "allocate-manager", "recall-to-admin", "opening"].includes(kind);
  if (directorOnly && !canImportExcel(user.role)) {
    return NextResponse.json({ error: "仅管理员可执行此导入" }, { status: 403 });
  }

  if (kind === "allocate-sales" && user.role !== "MANAGER" && !canImportExcel(user.role)) {
    return NextResponse.json({ error: "仅经理或管理员可分货给队员" }, { status: 403 });
  }

  if (kind === "withdraw" && user.role !== "MANAGER" && !canImportExcel(user.role)) {
    return NextResponse.json({ error: "仅经理或管理员可上传撤机（移机明细）" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "上传失败，请确认文件小于 100MB" }, { status: 413 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "请上传 .xlsx 文件" }, { status: 400 });
  }
  if (!file.name.endsWith(".xlsx")) {
    return NextResponse.json({ error: "仅支持 .xlsx 格式" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (kind === "inbound") {
      const parsed = parseInboundExcel(buffer);
      if (parsed.errors.length) {
        return NextResponse.json({ error: parsed.errors.join("；") }, { status: 400 });
      }
      const result = await importInboundRows(parsed.rows, user.id);
      return NextResponse.json({ kind, sheetName: parsed.sheetName, ...result });
    }

    if (kind === "allocate-manager") {
      const parsed = parseAllocateManagerExcel(buffer);
      if (parsed.errors.length) {
        return NextResponse.json({ error: parsed.errors.join("；") }, { status: 400 });
      }
      const result = await importAllocateToManagerRows(parsed.rows, user.id);
      return NextResponse.json({ kind, sheetName: parsed.sheetName, ...result });
    }

    if (kind === "recall-to-admin") {
      const parsed = parseRecallToAdminExcel(buffer);
      if (parsed.errors.length) {
        return NextResponse.json({ error: parsed.errors.join("；") }, { status: 400 });
      }
      const result = await importRecallToAdminRows(parsed.rows, user.id);
      return NextResponse.json({ kind, sheetName: parsed.sheetName, ...result });
    }

    if (kind === "allocate-sales") {
      const parsed = parseAllocateSalesExcel(buffer);
      if (parsed.errors.length) {
        return NextResponse.json({ error: parsed.errors.join("；") }, { status: 400 });
      }
      const scopeManager = canImportExcel(user.role)
        ? (formData.get("managerName") as string | null)?.trim() || managerName
        : managerName;
      if (!scopeManager) {
        return NextResponse.json({ error: "缺少经理归属" }, { status: 400 });
      }
      const result = await importAllocateToSalesRows(
        parsed.rows,
        scopeManager,
        user.id
      );
      return NextResponse.json({ kind, sheetName: parsed.sheetName, managerName: scopeManager, ...result });
    }

    if (kind === "withdraw") {
      const parsed = parseWithdrawExcel(buffer);
      if (parsed.errors.length) {
        return NextResponse.json({ error: parsed.errors.join("；") }, { status: 400 });
      }
      const rows = dedupeWithdrawRows(parsed.rows);
      const result = await importWithdrawRows(rows, user.id, {
        isAdmin: canImportExcel(user.role),
        managerScope: canImportExcel(user.role) ? null : managerName,
      });
      return NextResponse.json({
        kind,
        sheetName: parsed.sheetName,
        dedupedRows: rows.length,
        ...result,
      });
    }

    if (kind === "opening") {
      const parsed = parseOpeningExcel(buffer);
      if (parsed.errors.length) {
        return NextResponse.json({ error: parsed.errors.join("；") }, { status: 400 });
      }
      const rows = dedupeOpeningRows(parsed.rows);
      const result = await importOpeningBalanceRows(rows, user.id, { dryRun });
      return NextResponse.json({
        kind,
        sheetName: parsed.sheetName,
        dedupedRows: rows.length,
        dryRun,
        ...result,
      });
    }

    return NextResponse.json({ error: "未知 kind" }, { status: 400 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "导入失败";
    const message =
      raw.includes("portal") && raw.includes("does not exist")
        ? "数据库连接繁忙，请稍后重试（勿同时多次点击导入）"
        : raw.includes("Foreign key constraint")
          ? "部分设备 SN 尚未建档，请刷新后重试"
          : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
