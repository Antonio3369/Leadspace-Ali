import { redirect } from "next/navigation";
import { ensureLiveSession } from "@/lib/auth";
import { XlvInventoryPage } from "@/components/xlv/XlvInventoryPage";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";

export default async function XlvManagerInventoryPage() {
  const user = await ensureLiveSession();
  if (!canAccessXlvWorkspace(user)) redirect("/");
  if (user.role !== "MANAGER") redirect("/xlv");
  return <XlvInventoryPage isAdmin={false} />;
}
