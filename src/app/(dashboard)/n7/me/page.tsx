import { redirect } from "next/navigation";
import { MePanel } from "@/components/me/MePanel";
import { getSessionUser } from "@/lib/auth";
import { n7Path } from "@/lib/business-lines";

export default async function N7MePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "MANAGER" && user.role !== "SALES") {
    redirect(n7Path());
  }

  return (
    <MePanel
      user={user}
      teamHref={user.role === "MANAGER" ? n7Path("/me/team") : undefined}
    />
  );
}
