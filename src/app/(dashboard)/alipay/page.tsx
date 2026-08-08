import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { sessionAuthRealm } from "@/lib/auth-realm";
import { db } from "@/lib/db";
import {
  resolveAccessibleBusinessLines,
  DEFAULT_BUSINESS_LINES,
  type BusinessLineId,
} from "@/lib/business-lines";
import { BusinessHub } from "@/components/business/BusinessHub";

export default async function AlipayHubPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?group=alipay");
  if (sessionAuthRealm(user) === "xlv") redirect("/xlv");

  const live = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true, businessLines: true },
  }).catch(async () =>
    db.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    }).then((row) =>
      row ? { ...row, businessLines: DEFAULT_BUSINESS_LINES as string[] } : null
    )
  );

  const accessibleLines = resolveAccessibleBusinessLines(
    live?.role ?? user.role,
    live?.businessLines ?? user.businessLines
  ).filter((id): id is Exclude<BusinessLineId, "xlv"> => id !== "xlv");

  return (
    <BusinessHub
      userName={user.name}
      accessibleLines={accessibleLines}
      title="支付宝业务"
      subtitle="请选择要进入的工作台"
    />
  );
}
