import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { canAccessN7Workspace } from "@/services/n7/n7-scope";

export default async function N7ImportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessN7Workspace(user)) redirect("/");
  if (!canImportExcel(user.role)) redirect("/n7");
  return children;
}
