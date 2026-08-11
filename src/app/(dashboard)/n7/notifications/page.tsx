import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { n7Path } from "@/lib/business-lines";
import { canAccessN7Workspace } from "@/services/n7/n7-scope";
import { canViewN7Notifications } from "@/services/n7/notifications";
import { N7NotificationsView } from "@/components/n7/N7NotificationsView";

export default async function N7NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessN7Workspace(user)) redirect("/");
  if (!canViewN7Notifications(user)) redirect(n7Path());

  return (
    <N7NotificationsView
      pageTitle={
        user.role === "SALES"
          ? "经理反馈"
          : user.role === "MANAGER"
            ? "队员已处理"
            : "消息通知"
      }
    />
  );
}
