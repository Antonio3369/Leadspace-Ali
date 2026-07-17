import type { NextAuthConfig } from "next-auth";
import type { AccountLifecycle, UserRole, UserStatus } from "@/generated/prisma/client";
import { needsOnboarding } from "@/lib/account-lifecycle";
import {
  canAccessBusinessLine,
  isN7Path,
  isXlhPath,
  type BusinessLineId,
} from "@/lib/business-lines";

declare module "next-auth" {
  interface User {
    role: UserRole;
    status: UserStatus;
    teamId: string | null;
    accountLifecycle: AccountLifecycle;
    mustChangePassword: boolean;
    businessLines: BusinessLineId[];
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
      const isPublic =
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth");
      const isLoggedIn = !!auth?.user;

      if (isPublic) return true;
      if (!isLoggedIn) return false;

      if (auth.user.status !== "ACTIVE") {
        return Response.redirect(new URL("/login?disabled=1", request.nextUrl));
      }

      const mustChangePassword = auth.user.mustChangePassword;
      const onChangePassword =
        pathname.startsWith("/settings/password") ||
        pathname.startsWith("/change-password") ||
        pathname.startsWith("/api/auth/change-password");

      if (mustChangePassword) {
        if (!onChangePassword) {
          return Response.redirect(new URL("/settings/password", request.nextUrl));
        }
        return true;
      }

      if (pathname.startsWith("/change-password")) {
        return Response.redirect(new URL("/settings/password", request.nextUrl));
      }

      const lifecycle = auth.user.accountLifecycle;

      if (needsOnboarding(lifecycle)) {
        const onOnboarding =
          pathname.startsWith("/onboarding") || pathname.startsWith("/api/onboarding");
        if (!onOnboarding) {
          return Response.redirect(new URL("/onboarding", request.nextUrl));
        }
        return true;
      }

      if (pathname.startsWith("/onboarding")) {
        return Response.redirect(new URL("/", request.nextUrl));
      }

      if (pathname.startsWith("/xlh/screen") && auth?.user?.role !== "DIRECTOR") {
        return Response.redirect(new URL("/", request.nextUrl));
      }

      const lines = auth.user.businessLines ?? [];
      if (
        isXlhPath(pathname) &&
        !canAccessBusinessLine(auth.user.role, lines, "xlh")
      ) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      if (
        isN7Path(pathname) &&
        !canAccessBusinessLine(auth.user.role, lines, "n7")
      ) {
        return Response.redirect(new URL("/", request.nextUrl));
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
          name: session.user?.name ?? token.username,
          email: token.username,
          role: token.role,
          status: token.status,
          teamId: token.teamId,
          accountLifecycle: token.accountLifecycle,
          mustChangePassword: token.mustChangePassword,
          businessLines: token.businessLines ?? [],
        },
      };
    },
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
