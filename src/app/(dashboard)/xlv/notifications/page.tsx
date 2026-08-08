import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { xlvPath } from "@/lib/business-lines";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { canViewXlvFollowUpNotifications } from "@/services/xlv/notifications";
import { XlvNotificationsView } from "@/components/xlv/XlvNotificationsView";

export default async function XlvNotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user)) redirect("/");
  if (!canViewXlvFollowUpNotifications(user)) redirect(xlvPath());

  return <XlvNotificationsView />;
}
