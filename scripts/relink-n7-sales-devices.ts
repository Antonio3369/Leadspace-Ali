/**
 * 将 N7 设备挂到「经理本队队员」帐号上：
 * - 按作业员姓名 + 所属经理匹配
 * - 避免导入旧号（sales_中文_n）占着 salesUserId，导致拼音新号无数据
 * - 旧号若因此变为 0 台设备且用户名为 sales_ 前缀，则停用
 */
import { db } from "../src/lib/db";

async function main() {
  const managers = await db.user.findMany({
    where: { role: "MANAGER", status: { not: "DISABLED" } },
    select: { id: true, name: true },
  });

  let totalRelinked = 0;
  const perSales: Array<{
    manager: string;
    sales: string;
    username: string;
    count: number;
  }> = [];

  for (const manager of managers) {
    const roster = await db.user.findMany({
      where: {
        role: "SALES",
        managerId: manager.id,
        status: { not: "DISABLED" },
      },
      select: { id: true, name: true, username: true },
      orderBy: { createdAt: "asc" },
    });

    // 同名多条时优先拼音帐号（非 sales_ 前缀），否则取最新一条之外的策略：取 username 不含「sales_」的
    const byName = new Map<string, typeof roster>();
    for (const s of roster) {
      const list = byName.get(s.name) ?? [];
      list.push(s);
      byName.set(s.name, list);
    }

    for (const [name, list] of byName) {
      const preferred =
        list.find((s) => !s.username.startsWith("sales_")) ?? list[list.length - 1]!;

      const result = await db.n7DeviceRecord.updateMany({
        where: {
          operatorName: name,
          OR: [
            { managerUserId: manager.id },
            { managerName: manager.name },
          ],
        },
        data: { salesUserId: preferred.id },
      });

      if (result.count > 0) {
        totalRelinked += result.count;
        perSales.push({
          manager: manager.name,
          sales: name,
          username: preferred.username,
          count: result.count,
        });
      }

      // 同队同名的其它帐号若已无设备，停用 sales_ 旧号
      for (const other of list) {
        if (other.id === preferred.id) continue;
        if (!other.username.startsWith("sales_")) continue;
        const left = await db.n7DeviceRecord.count({
          where: { salesUserId: other.id },
        });
        if (left === 0) {
          await db.user.update({
            where: { id: other.id },
            data: { status: "DISABLED" },
          });
          console.log(
            `disabled orphan ${other.username} (${other.name}) under ${manager.name}`
          );
        }
      }
    }
  }

  // 他队/无经理挂靠的 sales_ 旧号：若设备已全部被改挂走，也停用
  const orphans = await db.user.findMany({
    where: {
      role: "SALES",
      username: { startsWith: "sales_" },
      status: { not: "DISABLED" },
    },
    select: { id: true, name: true, username: true, managerId: true },
  });
  for (const o of orphans) {
    const left = await db.n7DeviceRecord.count({ where: { salesUserId: o.id } });
    if (left === 0) {
      // 仅当存在同名、非 sales_ 的在职帐号时才停用，避免误伤唯一帐号
      const hasModern = await db.user.findFirst({
        where: {
          role: "SALES",
          name: o.name,
          id: { not: o.id },
          status: { not: "DISABLED" },
          NOT: { username: { startsWith: "sales_" } },
        },
        select: { id: true },
      });
      if (hasModern) {
        await db.user.update({
          where: { id: o.id },
          data: { status: "DISABLED" },
        });
        console.log(`disabled orphan ${o.username} (${o.name}) leftover`);
      }
    }
  }

  console.log("relinked rows", totalRelinked);
  console.log(JSON.stringify(perSales, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
