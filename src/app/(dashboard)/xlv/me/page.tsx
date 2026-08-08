import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loginPathForRealm, sessionAuthRealm } from "@/lib/auth-realm";
import { xlvPath } from "@/lib/business-lines";
import { MePanel } from "@/components/me/MePanel";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";

export default async function XlvMePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user)) redirect("/");

  return (
    <MePanel
      user={user}
      teamHref={
        user.role === "MANAGER" && user.authRealm === "xlv"
          ? xlvPath("/me/team")
          : undefined
      }
      switchHref="/"
      switchLabel="切换平台"
      signOutRedirectTo={loginPathForRealm(sessionAuthRealm(user))}
    />
  );
}
