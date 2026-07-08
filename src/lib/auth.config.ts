import type { NextAuthConfig } from "next-auth";
import type { AccountLifecycle, UserRole, UserStatus } from "@/generated/prisma/client";
import { needsOnboarding } from "@/lib/account-lifecycle";

declare module "next-auth" {
  interface User {
    role: UserRole;
    status: UserStatus;
    teamId: string | null;
    accountLifecycle: AccountLifecycle;
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

      if (pathname.startsWith("/screen") && auth?.user?.role !== "DIRECTOR") {
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
        },
      };
    },
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
