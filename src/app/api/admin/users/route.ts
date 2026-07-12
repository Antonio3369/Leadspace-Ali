import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ENABLED_USER_DEFAULTS, MANAGER_ENABLED_LIFECYCLE } from "@/lib/account-lifecycle";
import { allocatePinyinUsername } from "@/lib/pinyin-username";
import type { UserRole } from "@/generated/prisma/client";

const createUserSchema = z.object({
  username: z.string().min(2).optional(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["MANAGER", "SUPERVISOR", "SALES"]),
  teamId: z.string().optional(),
  managerId: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

function canCreateRole(creatorRole: UserRole, targetRole: UserRole): boolean {
  if (creatorRole === "DIRECTOR") return targetRole === "MANAGER";
  if (creatorRole === "MANAGER") return targetRole === "SUPERVISOR" || targetRole === "SALES";
  return false;
}

export async function GET() {
  try {
    const user = await requireSessionUser();

    let where = {};
    if (user.role === "DIRECTOR") {
      where = {};
    } else if (user.role === "MANAGER") {
      where = {
        OR: [{ managerId: user.id }, { id: user.id }, { manager: { managerId: user.id } }],
      };
    } else if (user.role === "SUPERVISOR" && user.teamId) {
      where = { teamId: user.teamId };
    } else {
      where = { id: user.id };
    }

    const users = await db.user.findMany({
      where,
      include: { team: true, manager: { select: { name: true } } },
      orderBy: [{ role: "desc" }, { name: "asc" }],
    });

    const teams = await db.orgUnit.findMany({
      where: { type: "TEAM" },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users, teams });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = createUserSchema.parse(await request.json());

    if (!canCreateRole(user.role, body.role)) {
      return NextResponse.json({ error: "无权创建该角色" }, { status: 403 });
    }

    if (body.role === "SALES") {
      return NextResponse.json(
        { error: "业务员请通过人员名单 Excel 导入，不支持在此创建登录账号" },
        { status: 400 }
      );
    }

    if (body.role === "SUPERVISOR" && !body.teamId) {
      const team = await db.orgUnit.create({
        data: {
          name: `${body.name}小组`,
          type: "TEAM",
          parentId: user.teamId ?? undefined,
        },
      });
      body.teamId = team.id;
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const username =
      body.username && body.username !== "pending"
        ? body.username
        : await allocatePinyinUsername(body.name);
    const accountLifecycle =
      user.role === "DIRECTOR" && body.role === "MANAGER"
        ? MANAGER_ENABLED_LIFECYCLE
        : ENABLED_USER_DEFAULTS.accountLifecycle;

    const created = await db.user.create({
      data: {
        username,
        passwordHash,
        name: body.name,
        role: body.role,
        teamId: body.teamId,
        managerId: body.role === "MANAGER" ? undefined : body.managerId ?? user.id,
        aliases: body.aliases ?? [],
        accountLifecycle,
        mustChangePassword: true,
      },
    });

    return NextResponse.json({ user: { id: created.id, username: created.username, name: created.name, role: created.role } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "创建失败";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
