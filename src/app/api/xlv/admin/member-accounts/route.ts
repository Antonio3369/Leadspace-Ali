import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import type { UserRole } from "@/generated/prisma/client";
import { PermissionError, canImportExcel } from "@/lib/permissions";
import {
  backfillXlvMemberAccountsFromStoredRoster,
  listXlvManagerAccountsForAdmin,
  resetXlvMemberPassword,
  setXlvMemberStatus,
} from "@/services/xlv/member-accounts";

function assertXlvAdmin(role: UserRole) {
  if (!canImportExcel(role)) {
    throw new Error("FORBIDDEN");
  }
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    assertXlvAdmin(user.role);

    const backfill = await backfillXlvMemberAccountsFromStoredRoster();
    const accounts = await listXlvManagerAccountsForAdmin();

    const hints: string[] = [];
    if (backfill.created > 0) {
      hints.push(`已从组织名册新开 ${backfill.created} 个经理/作业员账号`);
    }
    if (backfill.updated > 0) {
      hints.push(`已为 ${backfill.updated} 人补开通登录（初始密码 123456）`);
    }
    if (backfill.renamed > 0) {
      hints.push(`已修正 ${backfill.renamed} 个登录名为纯拼音`);
    }

    return NextResponse.json({
      accounts,
      rosterRows: backfill.rosterRows,
      ...(hints.length > 0 ? { backfillHint: hints.join("；") + "。" } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("backfill"),
  }),
  z.object({
    action: z.literal("reset"),
    accountId: z.string().min(1),
  }),
  z.object({
    action: z.literal("status"),
    accountId: z.string().min(1),
    status: z.enum(["ACTIVE", "DISABLED"]),
  }),
]);

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    assertXlvAdmin(user.role);

    const body = postSchema.parse(await request.json());

    if (body.action === "backfill") {
      const backfill = await backfillXlvMemberAccountsFromStoredRoster();
      const accounts = await listXlvManagerAccountsForAdmin();
      return NextResponse.json({ ok: true, backfill, accounts });
    }

    if (body.action === "reset") {
      const result = await resetXlvMemberPassword(body.accountId, user);
      return NextResponse.json({ ok: true, user: result });
    }

    const updated = await setXlvMemberStatus(body.accountId, body.status, user);
    return NextResponse.json({
      ok: true,
      user: { id: updated.id, name: updated.name, status: body.status },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "操作失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
