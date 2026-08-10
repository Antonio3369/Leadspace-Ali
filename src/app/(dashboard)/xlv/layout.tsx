import { getSessionUser } from "@/lib/auth";
import { XlvWorkspacePrefetch } from "@/components/xlv/XlvWorkspacePrefetch";
import { XlvWorkspaceShell } from "@/components/xlv/XlvWorkspaceShell";
import { xlvSessionManagerKey } from "@/services/xlv/xlv-scope";

export default async function XlvLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const role = user?.role ?? "SALES";
  const managerKey =
    user?.role === "MANAGER" ? xlvSessionManagerKey(user) : null;

  return (
    <>
      <XlvWorkspacePrefetch role={role} managerKey={managerKey} />
      <XlvWorkspaceShell role={role}>{children}</XlvWorkspaceShell>
    </>
  );
}
