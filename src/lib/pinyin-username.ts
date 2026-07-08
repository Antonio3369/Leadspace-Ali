import { pinyin } from "pinyin-pro";
import { db } from "@/lib/db";

/** 中文姓名 → 登录账号拼音（小写、无分隔符） */
export function chineseNameToPinyinUsername(name: string): string {
  const raw = pinyin(name.trim(), { toneType: "none", type: "array" }).join("");
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || "user";
}

/** 分配唯一拼音登录名（冲突时追加数字后缀） */
export async function allocatePinyinUsername(
  name: string,
  excludeUserId?: string
): Promise<string> {
  const base = chineseNameToPinyinUsername(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const conflict = await db.user.findFirst({
      where: {
        username: candidate,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (!conflict) return candidate;
    candidate = `${base}${suffix++}`;
  }
}
