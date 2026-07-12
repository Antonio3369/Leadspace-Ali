import { ensureLiveSession } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { SignOutButton } from "@/components/layout/SignOutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureLiveSession();

  return (
    <AppShell
      user={user}
      signOutMobile={
        <SignOutButton
          className="text-xs text-[#64748b] hover:text-[#111827] shrink-0"
          label="退出"
        />
      }
      signOutDesktop={
        <SignOutButton className="text-sm text-[#64748b] hover:text-[#111827] transition-colors" />
      }
    >
      {children}
    </AppShell>
  );
}
