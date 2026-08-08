import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  backfillXlvOperatorAccountsForManager,
  listXlvOperatorAccountsForManager,
  resetXlvMemberPassword,
  setXlvMemberStatus,
  xlvManagerNameFromSession,
} from "@/services/xlv/member-accounts";

function assertXlvManager(user: Awaited<ReturnType<typeof requireSessionUser>>) {
  if (user.role !== "MANAGER" || user.authRealm !== "xlv") {
    throw new Error("FORBIDDEN");
  }
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    assertXlvManager(user);

    const managerName = xlvManagerNameFromSession(user);
    const backfill = await backfillXlvOperatorAccountsForManager(managerName);
    const accounts = await listXlvOperatorAccountsForManager(managerName);

    const hints: string[] = [];
    if (backfill.created > 0) {
      hints.push(`已为本队新开 ${backfill.created} 个作业员账号`);
    }
    if (backfill.updated > 0) {
      hints.push(`已为 ${backfill.updated} 名队员补开通登录`);
    }
    if (backfill.renamed > 0) {
      hints.push(`已修正 ${backfill.renamed} 个登录名为纯拼音`);
    }

    return NextResponse.json({
      accounts,
      managerName,
      rosterRows: backfill.rosterRows,
      ...(hints.length > 0 ? { backfillHint: hints.join("；") + "。" } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "仅经理可管理本队队员" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const postSchema = z.discriminatedUnion("action", [
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
    assertXlvManager(user);

    const body = postSchema.parse(await request.json());

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
      return NextResponse.json({ error: "仅经理可管理本队队员" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
