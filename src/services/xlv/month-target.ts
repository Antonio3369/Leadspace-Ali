import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { xlvChannelLabel } from "@/lib/xlv-channel";
import {
  xlvMonthHitLabel,
  type XlvMonthHitChannel,
} from "@/lib/xlv-month-hit";
import {
  assertCanViewXlv,
  buildXlvOperationalDeviceWhere,
  buildXlvRoleWhere,
} from "@/services/xlv/xlv-scope";
import { withXlvBoardCache } from "@/services/xlv/board-cache";

export type XlvMonthTargetHits = {
  label: string;
  fubei: number;
  leshua: number;
  fubeiSns: string[];
  leshuaSns: string[];
};

/** 与「已达标」同一批：已铺设且考核状态为已达标，再按渠道拆开。不按装机日期收窄。 */
async function computeXlvMonthTargetHits(
  user: SessionUser,
  dateFrom: string,
  dateTo: string
): Promise<XlvMonthTargetHits> {
  assertCanViewXlv(user);
  const label = xlvMonthHitLabel(dateFrom, dateTo);
  const devices = await db.xlvDeviceRecord.findMany({
    where: {
      AND: [
        buildXlvRoleWhere(user),
        buildXlvOperationalDeviceWhere(),
        { qualificationStatus: "qualified" },
      ],
    },
    select: { deviceSn: true, channel: true },
  });

  const fubeiSns: string[] = [];
  const leshuaSns: string[] = [];
  for (const device of devices) {
    const channel = xlvChannelLabel(device.channel);
    if (channel === "付呗") fubeiSns.push(device.deviceSn);
    else if (channel === "乐刷") leshuaSns.push(device.deviceSn);
  }

  return {
    label,
    fubei: fubeiSns.length,
    leshua: leshuaSns.length,
    fubeiSns,
    leshuaSns,
  };
}

export async function loadXlvMonthTargetHits(
  user: SessionUser,
  opts: { dateFrom: string; dateTo: string }
): Promise<XlvMonthTargetHits> {
  const key = [
    "month-hit-v6",
    user.id,
    user.role,
    user.xlvManagerName ?? "",
    user.name,
    opts.dateFrom,
    opts.dateTo,
  ].join(":");
  return withXlvBoardCache(key, () =>
    computeXlvMonthTargetHits(user, opts.dateFrom, opts.dateTo)
  );
}

export function xlvMonthHitSns(
  hits: XlvMonthTargetHits,
  channel: XlvMonthHitChannel
) {
  return channel === "fubei" ? hits.fubeiSns : hits.leshuaSns;
}
