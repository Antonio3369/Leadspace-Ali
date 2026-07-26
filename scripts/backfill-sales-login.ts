/**
 * 仅为 N7 队员补开通登录：在职、含 n7（或未写业务线）、尚不能登录 → 默认密码 123456 + ACTIVE。
 * 用法: npx tsx scripts/backfill-sales-login.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "123456";

function isN7SalesCandidate(businessLines: string[]): boolean {
  if (businessLines.length === 0) return true;
  return businessLines.includes("n7");
}

function canSignIn(
  lifecycle: string,
  passwordHash: string | null | undefined
): boolean {
  if (lifecycle === "IMPORTED" || !passwordHash) return false;
  return lifecycle === "PENDING_ONBOARDING" || lifecycle === "ACTIVE";
}

async function main() {
  const candidates = await db.user.findMany({
    where: { role: "SALES", status: { not: "DISABLED" } },
    select: {
      id: true,
      username: true,
      name: true,
      passwordHash: true,
      accountLifecycle: true,
      businessLines: true,
    },
  });

  const needFix = candidates.filter(
    (u) => isN7SalesCandidate(u.businessLines) && !canSignIn(u.accountLifecycle, u.passwordHash)
  );

  if (needFix.length === 0) {
    console.log("无需补开通：所有在职 N7 队员已可登录");
    return;
  }

  const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  for (const u of needFix) {
    const hasPassword = Boolean(u.passwordHash);
    const lines =
      u.businessLines.length > 0
        ? u.businessLines.includes("n7")
          ? u.businessLines
          : [...u.businessLines, "n7"]
        : ["n7"];
    await db.user.update({
      where: { id: u.id },
      data: {
        passwordHash: hasPassword ? u.passwordHash! : defaultHash,
        accountLifecycle: "ACTIVE",
        mustChangePassword: hasPassword ? undefined : true,
        status: "ACTIVE",
        businessLines: lines,
      },
    });
    console.log(
      `✓ ${u.name} (${u.username}) ${hasPassword ? "纠正生命周期" : `开通，密码 ${DEFAULT_PASSWORD}`}`
    );
  }
  console.log(`完成：补开通 N7 队员 ${needFix.length} 人`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
