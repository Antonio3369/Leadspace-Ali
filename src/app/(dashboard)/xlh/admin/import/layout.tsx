import { redirect } from "next/navigation";
import { ensureLiveSession } from "@/lib/auth";
import { canImportExcel } from "@/lib/permissions";

export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  const user = await ensureLiveSession();
  if (!canImportExcel(user.role)) {
    redirect("/");
  }
  return children;
}
