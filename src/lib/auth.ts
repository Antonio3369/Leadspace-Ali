import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { canSignIn } from "@/lib/account-lifecycle";
import {
  resolveAccessibleBusinessLines,
  type BusinessLineId,
} from "@/lib/business-lines";
import { canLogin, canRoleSignIn, type SessionUser } from "@/lib/permissions";

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
        return token;
      }

      if (token.id) {
        const live = await loadLiveUserState(token.id as string);
        if (live) {
          token.status = live.status;
          token.accountLifecycle = live.accountLifecycle;
          token.mustChangePassword = live.mustChangePassword;
          token.businessLines = resolveAccessibleBusinessLines(
            token.role as string,
            live.businessLines
          );
        }
      }
      return token;
    },
  },
  providers: [
    Credentials({
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
            : ["xlh", "n7"];

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

async function loadLiveUserState(userId: string) {
  try {
    return await db.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        accountLifecycle: true,
        mustChangePassword: true,
        businessLines: true,
        role: true,
      },
    });
  } catch {
    // Prisma Client 未热更新时兜底，避免登录后 JWT 整段失败被踢回登录页
    const fallback = await db.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        accountLifecycle: true,
        mustChangePassword: true,
        role: true,
      },
    });
    if (!fallback) return null;
    return { ...fallback, businessLines: ["xlh", "n7"] as string[] };
  }
}

/** 与数据库同步 session：停用或生命周期变更时强制退出 */
export async function ensureLiveSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const live = await loadLiveUserState(user.id);
  if (!live || !canLogin(live.status)) {
    redirect("/api/auth/session-expired?reason=disabled");
  }

  if (
    live.status !== user.status ||
    live.accountLifecycle !== user.accountLifecycle ||
    live.mustChangePassword !== user.mustChangePassword
  ) {
    redirect("/api/auth/session-expired?reason=refresh");
  }

  const businessLines = resolveAccessibleBusinessLines(
    live.role,
    live.businessLines
  );

  return {
    ...user,
    status: live.status,
    accountLifecycle: live.accountLifecycle,
    mustChangePassword: live.mustChangePassword,
    businessLines,
  };
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  const live = await loadLiveUserState(user.id);
  if (!live || !canLogin(live.status)) {
    throw new Error("FORBIDDEN");
  }

  return {
    ...user,
    status: live.status,
    accountLifecycle: live.accountLifecycle,
    mustChangePassword: live.mustChangePassword,
    businessLines: resolveAccessibleBusinessLines(
      live.role,
      live.businessLines
    ) as BusinessLineId[],
  };
}
