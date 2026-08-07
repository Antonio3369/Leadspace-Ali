import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";

export default async function XlvAttributionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessXlvWorkspace(user)) redirect("/");
  if (!canImportExcel(user.role)) redirect("/xlv");
  return children;
}
