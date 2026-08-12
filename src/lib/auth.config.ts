import type { NextAuthConfig } from "next-auth";
import type { AccountLifecycle, UserRole, UserStatus } from "@/generated/prisma/client";
import { needsOnboarding } from "@/lib/account-lifecycle";
import {
  canAccessPathWithSession,
  defaultHomeForRealm,
  isPublicPath,
  sessionAuthRealm,
  isApiPath,
  apiJsonError,
} from "@/lib/auth-realm";
import type { AuthRealm } from "@/lib/permissions";
import type { BusinessLineId } from "@/lib/business-lines";
import { isXlvScopePath } from "@/lib/business-lines";

declare module "next-auth" {
  interface User {
    role: UserRole;
    status: UserStatus;
    teamId: string | null;
    accountLifecycle: AccountLifecycle;
    mustChangePassword: boolean;
    businessLines: BusinessLineId[];
    authRealm: AuthRealm;
    xlvManagerName?: string | null;
    xlvOperatorName?: string | null;
  }

  interface Session {
    user: {
      id: string;
      username: string;
      name: string;
      role: UserRole;
      status: UserStatus;
      teamId: string | null;
      accountLifecycle: AccountLifecycle;
      mustChangePassword: boolean;
      businessLines: BusinessLineId[];
      authRealm: AuthRealm;
      xlvManagerName?: string | null;
      xlvOperatorName?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: UserRole;
    status: UserStatus;
    teamId: string | null;
    accountLifecycle: AccountLifecycle;
    mustChangePassword: boolean;
    businessLines: BusinessLineId[];
    authRealm: AuthRealm;
    name?: string | null;
    xlvManagerName?: string | null;
    xlvOperatorName?: string | null;
  }
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname)) return true;

      const isLoggedIn = !!auth?.user;
      if (!isLoggedIn) {
        if (isApiPath(pathname)) {
          return apiJsonError(401, "未登录");
        }
        if (isXlvScopePath(pathname)) {
          return Response.redirect(new URL("/login/xlv", request.nextUrl));
        }
        return false;
      }

      if (auth.user.status !== "ACTIVE") {
        if (isApiPath(pathname)) {
          return apiJsonError(403, "账号不可用");
        }
        return Response.redirect(new URL("/login?disabled=1", request.nextUrl));
      }

      const realm = sessionAuthRealm(auth.user);
      const mustChangePassword = auth.user.mustChangePassword;
      const onChangePassword =
        pathname.startsWith("/settings/password") ||
        pathname.startsWith("/change-password") ||
        pathname.startsWith("/api/auth/change-password");

      if (mustChangePassword) {
        if (!onChangePassword) {
          if (isApiPath(pathname)) {
            return apiJsonError(403, "请先修改密码");
          }
          return Response.redirect(new URL("/settings/password", request.nextUrl));
        }
        return true;
      }

      if (pathname.startsWith("/change-password")) {
        return Response.redirect(new URL("/settings/password", request.nextUrl));
      }

      const lifecycle = auth.user.accountLifecycle;

      if (needsOnboarding(lifecycle) && realm === "alipay") {
        const onOnboarding =
          pathname.startsWith("/onboarding") || pathname.startsWith("/api/onboarding");
        if (!onOnboarding) {
          if (isApiPath(pathname)) {
            return apiJsonError(403, "请先完成实名认证");
          }
          return Response.redirect(new URL("/onboarding", request.nextUrl));
        }
        return true;
      }

      if (pathname.startsWith("/onboarding")) {
        return Response.redirect(new URL(defaultHomeForRealm(realm), request.nextUrl));
      }

      if (pathname === "/") {
        return Response.redirect(
          new URL(defaultHomeForRealm(realm), request.nextUrl)
        );
      }

      if (pathname.startsWith("/xlh/screen") && auth?.user?.role !== "DIRECTOR") {
        return Response.redirect(new URL("/alipay", request.nextUrl));
      }

      const access = canAccessPathWithSession(pathname, auth.user);
      if (access === false) {
        if (isApiPath(pathname)) {
          return apiJsonError(403, "无权访问");
        }
        return Response.redirect(
          new URL(defaultHomeForRealm(realm), request.nextUrl)
        );
      }

      return true;
    },
    jwt({ token, user }) {
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
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id,
          username: token.username,
          name: token.name ?? token.username,
          email: token.username,
          role: token.role,
          status: token.status,
          teamId: token.teamId,
          accountLifecycle: token.accountLifecycle,
          mustChangePassword: token.mustChangePassword,
          businessLines: token.businessLines ?? [],
          authRealm: token.authRealm ?? "alipay",
          xlvManagerName: token.xlvManagerName ?? null,
          xlvOperatorName: token.xlvOperatorName ?? null,
        },
      };
    },
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
