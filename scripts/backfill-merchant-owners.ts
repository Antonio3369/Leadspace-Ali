import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildUserLookupMap, findUserInMap } from "../src/services/org/user-matcher";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const lookup = await buildUserLookupMap();
  const merchants = await db.merchantRecord.findMany({
    where: { salesUserId: null },
    select: { id: true, salesUserName: true },
  });

  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = new Map<string, number>();

  for (const merchant of merchants) {
    const name = merchant.salesUserName?.trim();
    if (!name) {
      unmatched++;
      continue;
    }

    const user = findUserInMap(lookup, name);
    if (!user) {
      unmatched++;
      unmatchedNames.set(name, (unmatchedNames.get(name) ?? 0) + 1);
      continue;
    }

    if (!dryRun) {
      await db.merchantRecord.update({
        where: { id: merchant.id },
        data: {
          salesUserId: user.id,
          teamId: user.teamId ?? undefined,
        },
      });
    }
    matched++;
  }

  console.log(`模式: ${dryRun ? "预览（不写库）" : "执行"}`);
  console.log(`待回溯商户: ${merchants.length}`);
  console.log(`匹配成功: ${matched}`);
  console.log(`仍未匹配: ${unmatched}`);

  if (unmatchedNames.size > 0) {
    console.log("\n未匹配员工名称 Top 10:");
    [...unmatchedNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, count]) => console.log(`  ${name}: ${count}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
