import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { canSignIn, needsOnboarding } from "@/lib/account-lifecycle";
import {
  ALL_BUSINESS_LINE_IDS,
  DEFAULT_BUSINESS_LINES,
  resolveAccessibleBusinessLines,
  type BusinessLineId,
} from "@/lib/business-lines";
import { canLogin, canRoleSignIn, type SessionUser } from "@/lib/permissions";
import { findXlvMemberByUsername } from "@/services/xlv/member-accounts";

function mapXlvMemberRole(memberRole: string): SessionUser["role"] {
  return memberRole === "MANAGER" ? "MANAGER" : "SALES";
}

type LiveXlvMemberState = {
  status: SessionUser["status"];
  accountLifecycle: SessionUser["accountLifecycle"];
  mustChangePassword: boolean;
  memberRole: string;
  name: string;
  managerName: string;
  operatorName: string;
};

function applyLiveXlvMemberSession(
  user: SessionUser,
  live: LiveXlvMemberState
): SessionUser {
  const role = mapXlvMemberRole(live.memberRole);
  return {
    ...user,
    name: live.name,
    role,
    status: live.status,
    accountLifecycle: live.accountLifecycle,
    mustChangePassword: live.mustChangePassword,
    xlvManagerName: live.managerName,
    xlvOperatorName:
      live.memberRole === "OPERATOR" ? live.operatorName : null,
    businessLines: resolveAccessibleBusinessLines(
      role,
      user.businessLines ?? DEFAULT_BUSINESS_LINES
    ) as BusinessLineId[],
  };
}

async function finalizeSessionUser(
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>
) {
  if (!canLogin(user.status)) {
    throw new Error("FORBIDDEN");
  }

  if (user.authRealm === "xlv" && user.role !== "DIRECTOR") {
    const live = await loadLiveUserState(user).catch(() => null);
    if (live && "memberRole" in live) {
      return applyLiveXlvMemberSession(user, live);
    }
  }

  return {
    ...user,
    businessLines: resolveAccessibleBusinessLines(
      user.role,
      user.businessLines ?? DEFAULT_BUSINESS_LINES
    ) as BusinessLineId[],
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.username = user.email!;
        token.role = user.role;
        token.status = user.status;
        token.teamId = user.teamId;
        token.accountLifecycle = user.accountLifecycle;
        token.mustChangePassword = user.mustChangePassword;
        token.businessLines = user.businessLines;
        token.authRealm = user.authRealm ?? "alipay";
        token.name = user.name ?? null;
        token.xlvManagerName = user.xlvManagerName ?? null;
        token.xlvOperatorName = user.xlvOperatorName ?? null;
        return token;
      }

      if (token.id) {
        token.businessLines = resolveAccessibleBusinessLines(
          token.role as string,
          (token.businessLines as BusinessLineId[]) ?? DEFAULT_BUSINESS_LINES
        );
      }
      return token;
    },
  },
  providers: [
    Credentials({
      id: "alipay",
      credentials: {
        username: { label: "账号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!username || !password) return null;

        const user = await db.user.findUnique({ where: { username } });
        if (!user) return null;

        if (!canLogin(user.status)) return null;
        if (!canRoleSignIn(user.role)) return null;
        if (!canSignIn(user.accountLifecycle, user.passwordHash)) return null;

        const valid = await bcrypt.compare(password, user.passwordHash!);
        if (!valid) return null;

        const storedLines =
          "businessLines" in user && Array.isArray(user.businessLines)
            ? user.businessLines
            : DEFAULT_BUSINESS_LINES;

        return {
          id: user.id,
          name: user.name,
          email: user.username,
          role: user.role,
          status: user.status,
          teamId: user.teamId,
          accountLifecycle: user.accountLifecycle,
          mustChangePassword: user.mustChangePassword,
          businessLines: resolveAccessibleBusinessLines(user.role, storedLines),
          authRealm: "alipay" as const,
          xlvManagerName: null,
          xlvOperatorName: null,
        };
      },
    }),
    Credentials({
      id: "xlv",
      credentials: {
        username: { label: "账号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!username || !password) return null;

        const member = await findXlvMemberByUsername(username);
        if (member) {
          if (!canLogin(member.status)) return null;
          if (!canSignIn(member.accountLifecycle, member.passwordHash)) {
            return null;
          }
          const valid = await bcrypt.compare(password, member.passwordHash!);
          if (!valid) return null;

          const role = mapXlvMemberRole(member.memberRole);
          return {
            id: member.id,
            name: member.name,
            email: member.username,
            role,
            status: member.status,
            teamId: null,
            accountLifecycle: member.accountLifecycle,
            mustChangePassword: member.mustChangePassword,
            businessLines: ["xlv"] as BusinessLineId[],
            authRealm: "xlv" as const,
            xlvManagerName: member.managerName,
            xlvOperatorName:
              member.memberRole === "OPERATOR" ? member.operatorName : null,
          };
        }

        // 全局 admin：同一套 User 登录微信侧管理导入/归属
        const user = await db.user.findUnique({ where: { username } });
        if (!user || user.role !== "DIRECTOR") return null;
        if (!canLogin(user.status)) return null;
        if (!canSignIn(user.accountLifecycle, user.passwordHash)) return null;

        const valid = await bcrypt.compare(password, user.passwordHash!);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.username,
          role: user.role,
          status: user.status,
          teamId: user.teamId,
          accountLifecycle: user.accountLifecycle,
          mustChangePassword: user.mustChangePassword,
          businessLines: [...ALL_BUSINESS_LINE_IDS],
          authRealm: "xlv" as const,
          xlvManagerName: null,
          xlvOperatorName: null,
        };
      },
    }),
  ],
});

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user) return null;
  return session.user;
}

/** Route Handler 内优先用 req.auth（auth() 包装器注入），读不到时回退 auth() */
export async function requireSessionFromAuth(
  authUser: Awaited<ReturnType<typeof getSessionUser>> | null | undefined
) {
  const user = authUser ?? (await getSessionUser());
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return finalizeSessionUser(user);
}

async function loadLiveUserState(user: SessionUser) {
  if (user.authRealm === "xlv" && user.role !== "DIRECTOR") {
    return db.xlvMemberAccount.findUnique({
      where: { id: user.id },
      select: {
        status: true,
        accountLifecycle: true,
        mustChangePassword: true,
        memberRole: true,
        name: true,
        managerName: true,
        operatorName: true,
      },
    });
  }
  return db.user.findUnique({
    where: { id: user.id },
    select: {
      status: true,
      accountLifecycle: true,
      mustChangePassword: true,
      role: true,
    },
  });
}

/** 与数据库同步 session：仅在必须重新登录时踢出，其余漂移以 DB 为准 */
export async function ensureLiveSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const live = await loadLiveUserState(user).catch(() => null);
  if (!live) {
    if (!canLogin(user.status)) {
      redirect("/api/auth/session-expired?reason=disabled");
    }
    return {
      ...user,
      businessLines: resolveAccessibleBusinessLines(
        user.role,
        user.businessLines ?? DEFAULT_BUSINESS_LINES
      ),
    };
  }

  if (!canLogin(live.status)) {
    redirect("/api/auth/session-expired?reason=disabled");
  }

  if (live.mustChangePassword && !user.mustChangePassword) {
    redirect("/api/auth/session-expired?reason=refresh");
  }

  const liveLifecycle = live.accountLifecycle;
  if (
    liveLifecycle !== user.accountLifecycle &&
    needsOnboarding(liveLifecycle) &&
    !needsOnboarding(user.accountLifecycle)
  ) {
    redirect("/api/auth/session-expired?reason=refresh");
  }

  const role =
    user.authRealm === "xlv" && user.role !== "DIRECTOR" && "memberRole" in live
      ? mapXlvMemberRole((live as { memberRole: string }).memberRole)
      : user.role;

  const base = {
    ...user,
    role,
    status: live.status,
    accountLifecycle: live.accountLifecycle,
    mustChangePassword: live.mustChangePassword,
    businessLines: resolveAccessibleBusinessLines(
      role,
      user.businessLines ?? DEFAULT_BUSINESS_LINES
    ),
  };

  if (user.authRealm === "xlv" && user.role !== "DIRECTOR" && "memberRole" in live) {
    return applyLiveXlvMemberSession(base, live as LiveXlvMemberState);
  }

  return base;
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return finalizeSessionUser(user);
}
