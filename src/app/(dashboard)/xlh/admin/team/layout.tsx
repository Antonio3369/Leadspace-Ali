import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AdminTeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "MANAGER") redirect("/xlh/admin/org");
  return children;
}
