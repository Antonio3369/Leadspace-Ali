import { db } from "@/lib/db";
import { xlvMerchantLabel } from "@/lib/xlv-rules";
import { XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING } from "@/lib/xlv-withdraw";
import {
  resolveXlvDeviceManagerRecipient,
  resolveXlvDeviceOperatorRecipient,
} from "@/services/xlv/notifications";
import { createWithdrawPendingNotification } from "@/services/xlv/withdraw-notifications";
import {
  executeWithdrawDevice,
  type InventoryImportResult,
} from "@/services/xlv/inventory/service";

export type WithdrawImportRow = {
  deviceSn: string;
  operatorName: string;
  managerName: string;
  storeName: string | null;
  entryDate: Date | null;
};

async function resolveWithdrawRecipient(inventory: {
  deployedByRole: "manager" | "sales" | null;
  operatorName: string;
  managerName: string;
}): Promise<string | null> {
  if (inventory.deployedByRole === "sales") {
    return resolveXlvDeviceOperatorRecipient({
      operatorName: inventory.operatorName,
      managerName: inventory.managerName,
    });
  }
  return resolveXlvDeviceManagerRecipient({
    managerName: inventory.managerName,
  });
}

function merchantLabelFromRecord(record: {
  merchantName: string | null;
  activationMerchantName: string | null;
} | null) {
  if (!record) return null;
  return (
    xlvMerchantLabel({
      merchantName: record.merchantName,
      activationMerchantName: record.activationMerchantName,
    }) || record.merchantName?.trim() || null
  );
}

/** 上传移机明细：创建待确认撤机单并通知归属人（不立即改库存/运营） */
export async function createPendingWithdrawRequests(
  rows: WithdrawImportRow[],
  uploadedByUserId: string,
  opts: {
    isAdmin: boolean;
    managerScope: string | null;
  }
): Promise<InventoryImportResult> {
  const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const warnings: string[] = [];
  let successRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const existing = await db.xlvInventoryDevice.findUnique({
      where: { deviceSn: row.deviceSn },
    });

    if (!opts.isAdmin && opts.managerScope) {
      const scope = opts.managerScope.trim();
      if (row.managerName.trim() !== scope) {
        skippedRows++;
        warnings.push(`${row.deviceSn}：非本团队，跳过`);
        continue;
      }
    }

    if (!existing) {
      skippedRows++;
      warnings.push(`${row.deviceSn}：无库存记录，跳过（请先期初或入库）`);
      continue;
    }

    if (existing.status !== "deployed") {
      skippedRows++;
      warnings.push(`${row.deviceSn}：非已铺设状态，跳过`);
      continue;
    }

    const pending = await db.xlvWithdrawRequest.findFirst({
      where: { deviceSn: row.deviceSn, status: "pending" },
      select: { id: true },
    });
    if (pending) {
      skippedRows++;
      warnings.push(`${row.deviceSn}：已有待确认撤机，跳过`);
      continue;
    }

    const recipientId = await resolveWithdrawRecipient(existing);
    if (!recipientId) {
      skippedRows++;
      warnings.push(`${row.deviceSn}：找不到归属人小绿盒账号，跳过`);
      continue;
    }

    const deviceRecord = await db.xlvDeviceRecord.findUnique({
      where: { deviceSn: row.deviceSn },
      select: { merchantName: true, activationMerchantName: true },
    });
    const merchantName = merchantLabelFromRecord(deviceRecord);

    const request = await db.xlvWithdrawRequest.create({
      data: {
        deviceSn: row.deviceSn,
        batchId,
        merchantName,
        storeName: row.storeName,
        withdrawManagerName: row.managerName.trim(),
        withdrawOperatorName: row.operatorName.trim(),
        entryDate: row.entryDate,
        recipientMemberAccountId: recipientId,
        uploadedByUserId,
      },
    });

    await createWithdrawPendingNotification({
      requestId: request.id,
      deviceSn: row.deviceSn,
      merchantName,
      storeName: row.storeName,
      recipientMemberAccountId: recipientId,
    });

    successRows++;
  }

  return {
    batchId,
    totalRows: rows.length,
    successRows,
    skippedRows,
    errors: [],
    warnings,
  };
}

export async function approveWithdrawRequest(
  requestId: string,
  deciderMemberAccountId: string
) {
  const request = await db.xlvWithdrawRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "pending") {
    return { ok: false as const, error: "撤机申请不存在或已处理" };
  }
  if (request.recipientMemberAccountId !== deciderMemberAccountId) {
    return { ok: false as const, error: "仅设备归属人可确认" };
  }

  const inventory = await db.xlvInventoryDevice.findUnique({
    where: { deviceSn: request.deviceSn },
  });
  if (!inventory || inventory.status !== "deployed") {
    await db.xlvWithdrawRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        decidedByMemberAccountId: deciderMemberAccountId,
        decidedAt: new Date(),
      },
    });
    return { ok: false as const, error: "设备已非已铺设状态，申请已关闭" };
  }

  await executeWithdrawDevice(
    inventory,
    {
      deviceSn: request.deviceSn,
      operatorName: request.withdrawOperatorName,
      managerName: request.withdrawManagerName,
      storeName: request.storeName,
    },
    request.uploadedByUserId,
    request.batchId
  );

  await db.xlvWithdrawRequest.update({
    where: { id: requestId },
    data: {
      status: "approved",
      decidedByMemberAccountId: deciderMemberAccountId,
      decidedAt: new Date(),
    },
  });

  await db.xlvNotification.updateMany({
    where: {
      type: XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING,
      deviceSn: request.deviceSn,
      xlvMemberAccountId: deciderMemberAccountId,
      read: false,
    },
    data: { read: true, readAt: new Date() },
  });

  return { ok: true as const, deviceSn: request.deviceSn };
}

export async function rejectWithdrawRequest(
  requestId: string,
  deciderMemberAccountId: string
) {
  const request = await db.xlvWithdrawRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "pending") {
    return { ok: false as const, error: "撤机申请不存在或已处理" };
  }
  if (request.recipientMemberAccountId !== deciderMemberAccountId) {
    return { ok: false as const, error: "仅设备归属人可确认" };
  }

  await db.xlvWithdrawRequest.update({
    where: { id: requestId },
    data: {
      status: "rejected",
      decidedByMemberAccountId: deciderMemberAccountId,
      decidedAt: new Date(),
    },
  });

  await db.xlvNotification.updateMany({
    where: {
      type: XLV_NOTIFICATION_TYPE_WITHDRAW_PENDING,
      deviceSn: request.deviceSn,
      xlvMemberAccountId: deciderMemberAccountId,
      read: false,
    },
    data: { read: true, readAt: new Date() },
  });

  return { ok: true as const, deviceSn: request.deviceSn };
}
