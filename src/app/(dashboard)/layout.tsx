import { ensureLiveSession } from "@/lib/auth";
import { loginPathForRealm, sessionAuthRealm } from "@/lib/auth-realm";
import { AppShell } from "@/components/layout/AppShell";
import { SignOutButton } from "@/components/layout/SignOutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureLiveSession();
  const signInPath = loginPathForRealm(sessionAuthRealm(user));

  return (
    <AppShell
      user={user}
      signOutMobile={
        <SignOutButton
          className="text-xs text-[#64748b] hover:text-[#111827] shrink-0"
          label="退出"
          redirectTo={signInPath}
        />
      }
      signOutDesktop={
        <SignOutButton
          className="text-sm text-[#64748b] hover:text-[#111827] transition-colors"
          redirectTo={signInPath}
        />
      }
    >
      {children}
    </AppShell>
  );
}
