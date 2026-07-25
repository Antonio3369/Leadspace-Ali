import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { n7Path } from "@/lib/business-lines";

export default async function N7MeTeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "MANAGER") redirect(n7Path("/me"));
  return children;
}
