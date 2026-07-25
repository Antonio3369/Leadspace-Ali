/** 仅汉字姓名（2–20 字，开号用） */
export function isChinesePersonName(name: string): boolean {
  return /^[\u4e00-\u9fff]{2,20}$/.test(name.trim());
}

export function assertChinesePersonName(name: string, label = "姓名"): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(`请填写${label}`);
  if (!isChinesePersonName(trimmed)) {
    throw new Error(`${label}只能填写汉字`);
  }
  return trimmed;
}
