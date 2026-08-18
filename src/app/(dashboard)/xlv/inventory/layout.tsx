import { redirect } from "next/navigation";
import { ensureLiveSession } from "@/lib/auth";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";

export default async function XlvInventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureLiveSession();
  if (!canAccessXlvWorkspace(user)) redirect("/");
  if (user.role !== "MANAGER") redirect("/xlv");
  return children;
}
