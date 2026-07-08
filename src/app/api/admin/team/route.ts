import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildManagerManagedUserWhere } from "@/services/stats/manager-scope";
import { chineseNameToPinyinUsername } from "@/lib/pinyin-username";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "MANAGER") {
      return NextResponse.json({ error: "仅区域经理可访问" }, { status: 403 });
    }

    const staffWhere = await buildManagerManagedUserWhere(user.id);
    const members = await db.user.findMany({
      where: staffWhere,
      include: {
        platformIdentities: {
          select: { jobAccountName: true, personalPid: true },
        },
      },
      orderBy: [{ accountLifecycle: "asc" }, { name: "asc" }],
    });

    const roster = members.map((member) => ({
      id: member.id,
      username: member.username,
      name: member.name,
      role: member.role,
      status: member.status,
      accountLifecycle: member.accountLifecycle,
      suggestedUsername: chineseNameToPinyinUsername(member.name),
      identityCount: member.platformIdentities.length,
      identities: member.platformIdentities,
    }));

    return NextResponse.json({ roster, teamName: user.name + "团队" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
