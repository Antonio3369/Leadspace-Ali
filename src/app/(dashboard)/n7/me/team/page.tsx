"use client";

import { ManagerTeamPanel } from "@/components/admin/ManagerTeamPanel";
import { n7Path } from "@/lib/business-lines";

export default function N7MeTeamPage() {
  return <ManagerTeamPanel title="人员管理" backHref={n7Path("/me")} />;
}
