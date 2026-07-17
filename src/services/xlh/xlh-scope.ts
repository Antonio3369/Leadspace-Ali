import type { SessionUser } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { canAccessBusinessLine } from "@/lib/business-lines";

/** 小蓝环数据 API：需开通 xlh 业务线 */
export function assertCanViewXlh(user: SessionUser) {
  if (!canAccessBusinessLine(user.role, user.businessLines, "xlh")) {
    throw new PermissionError("未开通小蓝环业务线");
  }
}
