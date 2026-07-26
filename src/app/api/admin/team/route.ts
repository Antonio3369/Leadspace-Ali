import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { chineseNameToPinyinUsername, syncSalesPinyinUsernames } from "@/lib/pinyin-username";
import {
  backfillSalesLoginAccounts,
  createTeamSalesLoginAccount,
  dedupeSameNameTeamSales,
  deleteTeamSalesAccount,
  resetTeamSalesPassword,
  salesHasLoginAccess,
} from "@/services/org/team-sales";
import { buildManagerManagedUserWhere } from "@/services/stats/manager-scope";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "MANAGER") {
      return NextResponse.json({ error: "仅区域经理可访问" }, { status: 403 });
    }

    const staffWhere = await buildManagerManagedUserWhere(user.id);
    const members = await db.user.findMany({
      where: staffWhere,
      select: { id: true },
    });

    const memberIds = members.map((m) => m.id);
    // 人员管理页打开时：修旧登录名 + 补开通 + 本队同名双号去重（空号停用）
    await syncSalesPinyinUsernames(memberIds);
    const backfill = await backfillSalesLoginAccounts(memberIds);
    const dedupe = await dedupeSameNameTeamSales(user.id);

    const refreshed = await db.user.findMany({
      where: staffWhere,
      include: {
        platformIdentities: {
          select: { jobAccountName: true, personalPid: true },
        },
      },
      orderBy: [{ accountLifecycle: "asc" }, { name: "asc" }],
    });

    const roster = refreshed.map((member) => ({
      id: member.id,
      username: member.username,
      name: member.name,
      role: member.role,
      status: member.status,
      accountLifecycle: member.accountLifecycle,
      hasLogin: salesHasLoginAccess(member),
      suggestedUsername: chineseNameToPinyinUsername(member.name),
      identityCount: member.platformIdentities.length,
      identities: member.platformIdentities,
    }));

    const hints: string[] = [];
    if (backfill.enabled > 0) {
      hints.push(
        `已为 ${backfill.enabled} 名历史导入队员补开通登录，初始密码 123456，首次登录须改密。`
      );
    }
    if (dedupe.disabled > 0) {
      const detail = dedupe.kept
        .map(
          (k) =>
            `「${k.name}」保留 ${k.keepUsername}，停用 ${k.disabledUsernames.join("、")}`
        )
        .join("；");
      hints.push(
        `本队同名空号已处理：停用 ${dedupe.disabled} 个（未删除${
          dedupe.skipped > 0 ? `；另有 ${dedupe.skipped} 组双侧有数据已跳过` : ""
        }）。${detail}`
      );
    }

    return NextResponse.json({
      roster,
      teamName: user.name + "团队",
      ...(hints.length > 0 ? { backfillHint: hints.join(" ") } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1, "请填写队员姓名").max(20),
  }),
  z.object({
    action: z.literal("reset"),
    userId: z.string().min(1),
  }),
  z.object({
    action: z.literal("delete"),
    userId: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = postSchema.parse(await request.json());

    if (body.action === "create") {
      const created = await createTeamSalesLoginAccount(user, body.name);
      return NextResponse.json({ user: created, nameHint: created.nameHint });
    }

    if (body.action === "delete") {
      const deleted = await deleteTeamSalesAccount(user, body.userId);
      return NextResponse.json({ user: deleted });
    }

    const reset = await resetTeamSalesPassword(user, body.userId);
    return NextResponse.json({
      user: { name: reset.name, username: reset.username, password: reset.password },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "操作失败";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
