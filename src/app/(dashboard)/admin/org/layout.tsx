import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AdminOrgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "MANAGER") redirect("/admin/team");
  if (user.role !== "DIRECTOR") redirect("/");
  return children;
}
