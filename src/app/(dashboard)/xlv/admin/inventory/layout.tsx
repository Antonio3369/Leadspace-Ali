import { redirect } from "next/navigation";
import { ensureLiveSession } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";

export default async function XlvAdminInventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureLiveSession();
  if (!canAccessXlvWorkspace(user)) redirect("/");
  if (!canImportExcel(user.role)) redirect("/xlv");
  return children;
}
