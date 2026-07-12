import { db } from "@/lib/db";
import { getMerchantRetentionCutoff } from "@/lib/merchant-retention";

/** 硬删除拓展日期早于保留窗口的商户记录 */
export async function pruneMerchantsOutsideRetention(now = new Date()): Promise<number> {
  const cutoff = getMerchantRetentionCutoff(now);
  const result = await db.merchantRecord.deleteMany({
    where: { expandDate: { lt: cutoff } },
  });
  return result.count;
}
