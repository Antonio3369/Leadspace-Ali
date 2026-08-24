export function XlvRelocationBadge({
  fromStore,
  compact = false,
}: {
  fromStore?: string | null;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-semibold bg-[#f5f3ff] text-[#6d28d9] border-[#ddd6fe] ${
        compact ? "text-[11px]" : "text-xs"
      }`}
      title={fromStore ? `原门店 ${fromStore}` : "同一 SN 已换到新门店"}
    >
      移机到新店
    </span>
  );
}
