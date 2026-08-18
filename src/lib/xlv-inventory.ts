import type {
  XlvInventoryDeployedBy,
  XlvInventoryStatus,
  XlvInventoryTransferType,
} from "@/generated/prisma/client";

export type { XlvInventoryStatus, XlvInventoryTransferType, XlvInventoryDeployedBy };

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
