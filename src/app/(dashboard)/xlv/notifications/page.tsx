import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { xlvPath } from "@/lib/business-lines";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { canViewXlvNotifications } from "@/services/xlv/notifications";
import { XlvNotificationsView } from "@/components/xlv/XlvNotificationsView";

export default async function XlvNotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user)) redirect("/");
  if (!canViewXlvNotifications(user)) redirect(xlvPath());

  return (
    <XlvNotificationsView
      pageTitle="系统通知"
      audience={user.role === "SALES" ? "sales" : "manager"}
    />
  );
}
