import type {
  XlvInventoryDeployedBy,
  XlvInventoryStatus,
  XlvInventoryTransferType,
} from "@/generated/prisma/client";

export type { XlvInventoryStatus, XlvInventoryTransferType, XlvInventoryDeployedBy };

/**
 * 移机撤机明细导入 / 待确认：暂关闭。
 * 撤机改由 SN 归属推断：同 SN 商户名变更 = 已从旧商户撤机并铺到新商户。
 */
export const XLV_WITHDRAW_IMPORT_ENABLED = false;

export const XLV_INVENTORY_STATUS_LABEL: Record<XlvInventoryStatus, string> = {
  admin_stock: "事业部库存",
  pending_mgr_confirm: "待经理确认",
  manager_stock: "经理库存",
  sales_stock: "队员库存",
  deployed: "已铺设",
};

export const XLV_INVENTORY_STOCK_STATUSES: XlvInventoryStatus[] = [
  "admin_stock",
  "manager_stock",
  "sales_stock",
];

export function isXlvInventoryDeployed(status: XlvInventoryStatus) {
  return status === "deployed";
}

export function isXlvManagerSelfSale(managerName: string, operatorName: string) {
  const m = managerName.trim();
  const o = operatorName.trim();
  return m.length > 0 && m === o;
}

export function xlvWithdrawReturnStatus(
  deployedByRole: XlvInventoryDeployedBy | null | undefined
): XlvInventoryStatus {
  return deployedByRole === "sales" ? "sales_stock" : "manager_stock";
}

export function inferDeployedByRole(
  managerName: string,
  operatorName: string
): XlvInventoryDeployedBy {
  if (isXlvManagerSelfSale(managerName, operatorName)) return "manager";
  if (operatorName.trim()) return "sales";
  return "manager";
}
