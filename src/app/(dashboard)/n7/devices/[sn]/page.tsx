import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { n7Path } from "@/lib/business-lines";
import { canAccessN7Workspace } from "@/services/n7/n7-scope";
import { canSubmitN7FollowUpReview } from "@/services/n7/follow-up-review";
import { N7DeviceDetailView } from "@/components/n7/N7DeviceDetailView";

export default async function N7DevicePage({
  params,
}: {
  params: Promise<{ sn: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessN7Workspace(user)) redirect("/");

  const { sn } = await params;
  return (
    <N7DeviceDetailView
      sn={decodeURIComponent(sn)}
      canReviewFollowUp={canSubmitN7FollowUpReview(user)}
    />
  );
}
