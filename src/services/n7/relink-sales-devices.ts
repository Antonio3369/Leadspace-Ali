import { db } from "@/lib/db";

/**
 * 将 N7 设备按「作业员姓名 + 所属经理」挂到本队优选队员帐号
 *（对齐沙箱匹配键；修复仅按姓名错挂 / 旧 sales_ 号占坑导致拼音号无数据）
 */
export async function relinkN7SalesDevices(): Promise<{
  totalRelinked: number;
  disabledOrphans: number;
}> {
  const managers = await db.user.findMany({
    where: { role: "MANAGER", status: { not: "DISABLED" } },
    select: { id: true, name: true },
  });

  let totalRelinked = 0;
  let disabledOrphans = 0;

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

    const byName = new Map<string, typeof roster>();
    for (const s of roster) {
      const list = byName.get(s.name) ?? [];
      list.push(s);
      byName.set(s.name, list);
    }

    for (const [name, list] of byName) {
      const preferred =
        list.find((s) => !s.username.startsWith("sales_")) ??
        list[list.length - 1]!;

      const result = await db.n7DeviceRecord.updateMany({
        where: {
          operatorName: name,
          OR: [{ managerUserId: manager.id }, { managerName: manager.name }],
        },
        data: { salesUserId: preferred.id },
      });
      totalRelinked += result.count;

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
          disabledOrphans += 1;
        }
      }
    }
  }

  const orphans = await db.user.findMany({
    where: {
      role: "SALES",
      username: { startsWith: "sales_" },
      status: { not: "DISABLED" },
    },
    select: { id: true, name: true, username: true },
  });
  for (const o of orphans) {
    const left = await db.n7DeviceRecord.count({ where: { salesUserId: o.id } });
    if (left > 0) continue;
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
      disabledOrphans += 1;
    }
  }

  return { totalRelinked, disabledOrphans };
}
