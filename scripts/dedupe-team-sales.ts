/**
 * 全量：本队完全同名双号去重（保留有数据的，其余停用）
 * 用法: npx tsx scripts/dedupe-team-sales.ts
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { dedupeSameNameTeamSales } from "../src/services/org/team-sales";

async function main() {
  const managers = await db.user.findMany({
    where: { role: "MANAGER", status: { not: "DISABLED" } },
    select: { id: true, name: true },
  });

  let totalDisabled = 0;
  let totalGroups = 0;
  for (const m of managers) {
    const r = await dedupeSameNameTeamSales(m.id);
    if (r.disabled === 0) continue;
    totalDisabled += r.disabled;
    totalGroups += r.groups;
    console.log(
      `${m.name}: groups=${r.groups} disabled=${r.disabled}`,
      JSON.stringify(r.kept)
    );
  }
  console.log(`完成：处理 ${totalGroups} 组同名，停用 ${totalDisabled} 个账号`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
