import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessN7Workspace } from "@/services/n7/n7-scope";
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
  return <N7DeviceDetailView sn={decodeURIComponent(sn)} />;
}
