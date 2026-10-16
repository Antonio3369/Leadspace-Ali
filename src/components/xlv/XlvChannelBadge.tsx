import {
  xlvChannelBadgeClass,
  xlvChannelDisplay,
  xlvChannelLabel,
} from "@/lib/xlv-channel";

export function XlvChannelBadge({
  channel,
  compact = false,
}: {
  channel?: string | null;
  compact?: boolean;
}) {
  const text = xlvChannelDisplay(channel);
  if (!text) return null;
  return (
    <span
      className={`inline-flex rounded-md border font-semibold ${xlvChannelBadgeClass(xlvChannelLabel(channel))} ${
        compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
      }`}
      title="渠道"
    >
      {text}
    </span>
  );
}
