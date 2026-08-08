import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { xlvPath } from "@/lib/business-lines";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { XlvManagerTeamPanel } from "@/components/xlv/XlvManagerTeamPanel";

export default async function XlvMeTeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user)) redirect("/");
  if (user.role !== "MANAGER" || user.authRealm !== "xlv") {
    redirect(xlvPath());
  }

  return <XlvManagerTeamPanel backHref={xlvPath("/me")} />;
}
