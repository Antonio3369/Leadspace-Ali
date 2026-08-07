import { db } from "@/lib/db";
import { loadXlvRosterEntries } from "@/services/xlv/roster";

/** 按组织名册将经理/公司回写到设备（仅姓名字段，不关联 N7 账号） */
export async function syncXlvAttributionFromRoster(): Promise<{
  devicesUpdated: number;
  userIdsCleared: number;
}> {
  const entries = await loadXlvRosterEntries();
  let devicesUpdated = 0;

  for (const entry of entries) {
    const result = await db.xlvDeviceRecord.updateMany({
      where: { operatorName: entry.operatorName },
      data: {
        managerName: entry.managerName,
        ...(entry.companyName ? { companyName: entry.companyName } : {}),
      },
    });
    devicesUpdated += result.count;
  }

  let userIdsCleared = 0;
  userIdsCleared += (
    await db.xlvDeviceRecord.updateMany({
      where: { salesUserId: { not: null } },
      data: { salesUserId: null },
    })
  ).count;
  userIdsCleared += (
    await db.xlvDeviceRecord.updateMany({
      where: { managerUserId: { not: null } },
      data: { managerUserId: null },
    })
  ).count;

  return { devicesUpdated, userIdsCleared };
}

/** @deprecated 使用 syncXlvAttributionFromRoster */
export async function relinkAllXlvAttribution() {
  const result = await syncXlvAttributionFromRoster();
  return {
    managersFilled: result.devicesUpdated,
    totalRelinked: result.devicesUpdated,
    disabledOrphans: 0,
    devicesUpdated: result.devicesUpdated,
    userIdsCleared: result.userIdsCleared,
  };
}
