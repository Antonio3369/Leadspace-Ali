/** 库存账渠道：页面只展示「付呗」或「乐刷」 */
export type XlvChannelLabel = "付呗" | "乐刷";

export function xlvChannelLabel(
  raw: string | null | undefined
): XlvChannelLabel | null {
  const compact = (raw ?? "").replace(/\s/g, "");
  if (!compact) return null;
  if (compact.includes("付呗") || /fubei/i.test(compact)) return "付呗";
  if (compact.includes("乐刷") || /leshua|leshu/i.test(compact)) return "乐刷";
  return null;
}

/**
 * 运营原表文件名。两套名字同时出现（如「付呗乐刷…SN归属表」）不算单一渠道。
 */
export function xlvChannelFromFileName(
  fileName: string | null | undefined
): XlvChannelLabel | null {
  const name = fileName ?? "";
  const hasFubei = /付呗|fubei/i.test(name);
  const hasLeshua = /乐刷|leshua|leshu/i.test(name);
  if (hasFubei === hasLeshua) return null;
  return hasFubei ? "付呗" : "乐刷";
}

/** 能认出付呗/乐刷时用标准名，否则保留原文 */
export function xlvChannelDisplay(
  raw: string | null | undefined
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  return xlvChannelLabel(trimmed) ?? trimmed;
}

export function xlvChannelBadgeClass(label: XlvChannelLabel | null) {
  if (label === "付呗") return "bg-orange-50 text-orange-800 border-orange-200";
  if (label === "乐刷") return "bg-violet-50 text-violet-800 border-violet-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}
