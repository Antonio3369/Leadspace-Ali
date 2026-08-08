import { getSessionUser } from "@/lib/auth";
import { XlvWorkspacePrefetch } from "@/components/xlv/XlvWorkspacePrefetch";
import { XlvWorkspaceShell } from "@/components/xlv/XlvWorkspaceShell";

export default async function XlvLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const role = user?.role ?? "SALES";

  return (
    <>
      <XlvWorkspacePrefetch />
      <XlvWorkspaceShell role={role}>{children}</XlvWorkspaceShell>
    </>
  );
}
