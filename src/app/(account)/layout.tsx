import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/** 账号相关页：不用 ensureLiveSession，避免首登改密时被误踢去重登 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status !== "ACTIVE") redirect("/login?disabled=1");

  return (
    <div
      id="app-scroll"
      className="h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f4f6f9] [-webkit-overflow-scrolling:touch]"
    >
      <div className="w-full max-w-[1520px] mx-auto px-4 sm:px-5 py-5 md:py-7 min-w-0">{children}</div>
    </div>
  );
}
