import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveAccessibleBusinessLines } from "@/lib/business-lines";
import { BusinessHub } from "@/components/business/BusinessHub";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const live = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true, businessLines: true },
  }).catch(async () =>
    db.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    }).then((row) =>
      row ? { ...row, businessLines: ["xlh", "n7"] as string[] } : null
    )
  );

  const accessibleLines = resolveAccessibleBusinessLines(
    live?.role ?? user.role,
    live?.businessLines ?? user.businessLines
  );

  return (
    <BusinessHub userName={user.name} accessibleLines={accessibleLines} />
  );
}
