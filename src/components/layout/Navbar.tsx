import Link from "next/link";
import { signOut } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/generated/prisma/client";

interface NavbarProps {
  user: {
    name: string;
    role: UserRole;
  };
}

const NAV_ITEMS = [
  { href: "/", label: "数据总览" },
  { href: "/teams", label: "团队明细" },
  { href: "/opportunities", label: "商机分析" },
  { href: "/ledger", label: "风控台账" },
];

export function Navbar({ user }: NavbarProps) {
  return (
    <header className="bg-[#165DFF] text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link href="/" className="font-semibold text-lg whitespace-nowrap">
              Leadspace.Alipay
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 rounded-md text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
              {user.role === "DIRECTOR" && (
                <Link
                  href="/screen"
                  className="px-3 py-1.5 rounded-md text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                >
                  公共大屏
                </Link>
              )}
              {(user.role === "DIRECTOR" || user.role === "MANAGER") && (
                <>
                  <Link
                    href={user.role === "MANAGER" ? "/admin/team" : "/admin/org"}
                    className="px-3 py-1.5 rounded-md text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {user.role === "MANAGER" ? "团队管理" : "组织管理"}
                  </Link>
                  {user.role === "DIRECTOR" && (
                    <Link
                      href="/admin/import"
                      className="px-3 py-1.5 rounded-md text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      数据上传
                    </Link>
                  )}
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="text-sm text-white/80 hidden sm:inline">
              {user.name}
              <span className="ml-2 px-2 py-0.5 bg-white/15 rounded text-xs">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
            <span className="text-sm text-white/80 sm:hidden truncate max-w-[5rem]">
              {user.name}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="text-sm text-white/80 hover:text-white transition-colors"
              >
                退出
              </button>
            </form>
          </div>
        </div>

        <nav className="md:hidden flex items-center gap-1 overflow-x-auto pb-2 -mx-1 scrollbar-none">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-md text-xs text-white/90 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              {item.label}
            </Link>
          ))}
          {user.role === "DIRECTOR" && (
            <Link
              href="/screen"
              className="px-3 py-1.5 rounded-md text-xs text-white/90 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              公共大屏
            </Link>
          )}
          {(user.role === "DIRECTOR" || user.role === "MANAGER") && (
            <>
              <Link
                href={user.role === "MANAGER" ? "/admin/team" : "/admin/org"}
                className="px-3 py-1.5 rounded-md text-xs text-white/90 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
              >
                {user.role === "MANAGER" ? "团队管理" : "组织管理"}
              </Link>
              {user.role === "DIRECTOR" && (
                <Link
                  href="/admin/import"
                  className="px-3 py-1.5 rounded-md text-xs text-white/90 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                >
                  数据上传
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
