import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";
import { xlvPath } from "@/lib/business-lines";
import { canAccessXlvWorkspace } from "@/services/xlv/xlv-scope";
import { XlvCompanyBoardPage } from "@/components/xlv/XlvCompanyBoardPage";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login/xlv");
  if (!canAccessXlvWorkspace(user) || !canImportExcel(user.role)) {
    redirect(xlvPath());
  }
  return <XlvCompanyBoardPage />;
}
