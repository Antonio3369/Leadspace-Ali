import type { AuthRealm } from "@/lib/permissions";
import {
  canAccessBusinessLine,
  isN7Path,
  isXlhPath,
  isXlvScopePath,
} from "@/lib/business-lines";
import type { UserRole } from "@/generated/prisma/client";

export function sessionAuthRealm(
  user: { authRealm?: AuthRealm | string | null } | null | undefined
): AuthRealm {
  return user?.authRealm === "xlv" ? "xlv" : "alipay";
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

export function canAccessPathWithSession(
  pathname: string,
  user: {
    role: UserRole;
    authRealm?: AuthRealm | string | null;
    businessLines?: string[];
  }
): boolean | Response {
  const realm = sessionAuthRealm(user);

  if (realm === "xlv") {
    if (user.role === "DIRECTOR") {
      if (isXlvScopePath(pathname) || pathname.startsWith("/settings/")) return true;
      return false;
    }
    if (!isXlvScopePath(pathname) && !pathname.startsWith("/settings/")) {
      return false;
    }
    return true;
  }

  // 支付宝域
  if (isXlvScopePath(pathname)) {
    if (user.role === "DIRECTOR") {
      return canAccessBusinessLine(user.role, user.businessLines, "xlv");
    }
    return false;
  }

  // 支付宝域：业务枢纽与业务线
  if (pathname === "/alipay" || pathname.startsWith("/alipay/")) {
    return true;
  }

  if (isXlhPath(pathname) && !canAccessBusinessLine(user.role, user.businessLines, "xlh")) {
    return false;
  }
  if (isN7Path(pathname) && !canAccessBusinessLine(user.role, user.businessLines, "n7")) {
    return false;
  }

  return true;
}

export function defaultHomeForRealm(realm: AuthRealm): string {
  return realm === "xlv" ? "/xlv" : "/alipay";
}

export function loginPathForRealm(realm: AuthRealm): string {
  return realm === "xlv" ? "/login/xlv" : "/login";
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export function apiJsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
