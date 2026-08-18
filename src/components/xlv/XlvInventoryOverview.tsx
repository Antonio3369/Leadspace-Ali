"use client";

import type { InventoryManagerReportRow, InventoryOverview } from "@/services/xlv/inventory/service";
import { XLV_COMPLIANCE_TARGET_RATE } from "@/lib/xlv-rules";
import { NotionPanel } from "@/components/ui/notion";

function Metric({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string | number;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[12px] border border-[#eef2f7] bg-white px-3 py-3">
      <p className="text-xs text-[#94a3b8]">{label}</p>
      <p
        className={`text-xl font-bold tabular-nums mt-0.5 ${valueClassName ?? "text-[#111827]"}`}
      >
        {value}
      </p>
      {sub ? <p className="text-[10px] text-[#64748b] mt-1">{sub}</p> : null}
    </div>
  );
}

function complianceClass(rate: number | null) {
  if (rate == null) return "text-[#94a3b8]";
  if (rate >= XLV_COMPLIANCE_TARGET_RATE) return "text-emerald-700";
  return "text-[#b91c1c] font-semibold";
}

function ComplianceCell({ row }: { row: InventoryManagerReportRow }) {
  if (row.complianceRate == null || row.complianceDeviceCount === 0) {
    return (
      <td className="px-3 py-2.5 tabular-nums text-[#94a3b8]" title="暂无已铺设运营设备">
        —
      </td>
    );
  }

  return (
    <td className="px-3 py-2.5 tabular-nums">
      <span className={complianceClass(row.complianceRate)}>
        {row.complianceRate}%
      </span>
      {row.complianceGapCount > 0 ? (
        <p className="text-[10px] text-[#b91c1c] mt-0.5">
          差 {row.complianceGapCount} 台
        </p>
      ) : (
        <p className="text-[10px] text-emerald-700 mt-0.5">达标</p>
      )}
    </td>
  );
}

export function XlvInventoryOverview({
  overview,
  isAdmin,
}: {
  overview: InventoryOverview;
  isAdmin: boolean;
}) {
  const { scopeSummary, managers, staff } = overview;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {isAdmin ? (
          <Metric label="事业部库存" value={scopeSummary.adminStock} sub="待划拨总库" />
        ) : null}
        <Metric label="收到" value={scopeSummary.ledgerTotal} sub="物流账入账" />
        <Metric label="已铺设" value={scopeSummary.deployed} />
        <Metric label="剩余" value={scopeSummary.stockRemaining} />
        <Metric
          label="铺设率"
          value={`${scopeSummary.deployRate}%`}
          sub={
            scopeSummary.pendingReceipt > 0
              ? `待确认收货 ${scopeSummary.pendingReceipt}`
              : undefined
          }
        />
        <Metric
          label="合规率"
          value={
            scopeSummary.complianceRate != null
              ? `${scopeSummary.complianceRate}%`
              : "—"
          }
          sub={`运营考核 · 目标 ≥${XLV_COMPLIANCE_TARGET_RATE}%`}
          valueClassName={complianceClass(scopeSummary.complianceRate)}
        />
      </div>

      {isAdmin ? (
        <NotionPanel className="overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-[#eef2f7]">
            <p className="text-sm font-medium text-[#111827]">经理库存一览</p>
            <p className="text-xs text-[#64748b] mt-0.5">
              库存（收到 / 已铺设 / 剩余 / 铺设率）+ 合规率，供补货综合判断；合规率与团队看板口径一致
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#94a3b8] border-b border-[#eef2f7]">
                  <th className="px-4 py-2.5 font-medium">经理</th>
                  <th className="px-3 py-2.5 font-medium tabular-nums">收到</th>
                  <th className="px-3 py-2.5 font-medium tabular-nums">已铺设</th>
                  <th className="px-3 py-2.5 font-medium tabular-nums">剩余</th>
                  <th className="px-3 py-2.5 font-medium tabular-nums">铺设率</th>
                  <th className="px-4 py-2.5 font-medium tabular-nums">合规率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {managers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-[#94a3b8]"
                    >
                      暂无库存台账，请先完成期初盘点
                    </td>
                  </tr>
                ) : (
                  managers.map((row) => (
                    <tr key={row.managerName} className="hover:bg-[#f8fafc]">
                      <td className="px-4 py-2.5 font-medium text-[#111827]">
                        {row.managerName}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{row.ledgerTotal}</td>
                      <td className="px-3 py-2.5 tabular-nums">{row.deployed}</td>
                      <td className="px-3 py-2.5 tabular-nums font-medium">
                        {row.stockRemaining}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{row.deployRate}%</td>
                      <ComplianceCell row={row} />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </NotionPanel>
      ) : (
        <>
          {managers[0] ? (
            <NotionPanel>
              <p className="text-sm font-medium text-[#111827] mb-3">本团队</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                <div>
                  <p className="text-xs text-[#94a3b8]">收到</p>
                  <p className="font-semibold tabular-nums">
                    {managers[0].ledgerTotal}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94a3b8]">已铺设</p>
                  <p className="font-semibold tabular-nums">
                    {managers[0].deployed}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94a3b8]">剩余</p>
                  <p className="font-semibold tabular-nums">
                    {managers[0].stockRemaining}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94a3b8]">铺设率</p>
                  <p className="font-semibold tabular-nums">
                    {managers[0].deployRate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94a3b8]">合规率</p>
                  <p
                    className={`font-semibold tabular-nums ${complianceClass(managers[0].complianceRate)}`}
                  >
                    {managers[0].complianceRate != null
                      ? `${managers[0].complianceRate}%`
                      : "—"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#64748b] mt-3 tabular-nums">
                经理剩余 {managers[0].managerStock}
                {managers[0].salesStock > 0
                  ? ` · 队员手持 ${managers[0].salesStock}`
                  : ""}
                {managers[0].pendingReceipt > 0
                  ? ` · 待确认 ${managers[0].pendingReceipt}`
                  : ""}
                {managers[0].complianceGapCount > 0
                  ? ` · 距合规还差 ${managers[0].complianceGapCount} 台`
                  : ""}
              </p>
            </NotionPanel>
          ) : null}
          {staff && staff.length > 0 ? (
            <NotionPanel className="overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-[#eef2f7]">
                <p className="text-sm font-medium text-[#111827]">队员库存未铺设</p>
              </div>
              <ul className="divide-y divide-[#f1f5f9]">
                {staff.map((s) => (
                  <li
                    key={s.operatorName}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-[#111827]">{s.operatorName}</span>
                    <span className="tabular-nums font-medium text-[#64748b]">
                      {s.salesStock} 台
                    </span>
                  </li>
                ))}
              </ul>
            </NotionPanel>
          ) : null}
        </>
      )}
    </div>
  );
}
