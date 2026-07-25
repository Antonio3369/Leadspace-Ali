import { pinyin } from "pinyin-pro";
import { db } from "@/lib/db";

export { assertChinesePersonName, isChinesePersonName } from "@/lib/chinese-name";

/** 中文姓名 → 登录账号拼音（小写、无分隔符） */
export function chineseNameToPinyinUsername(name: string): string {
  const raw = pinyin(name.trim(), { toneType: "none", type: "array" }).join("");
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || "user";
}

/** 旧号如 sales_凌旭晨_3、含中文/非 ascii 的登录名，需改成拼音 */
export function usernameNeedsPinyinFix(username: string): boolean {
  const u = username.trim();
  if (!u) return true;
  if (/^sales_/i.test(u)) return true;
  if (/[^\x00-\x7F]/.test(u)) return true;
  return false;
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

/** 将队员登录名统一为姓名拼音（修掉 sales_中文_数字 等旧格式） */
export async function syncSalesPinyinUsernames(userIds?: string[]) {
  const sales = await db.user.findMany({
    where: {
      role: "SALES",
      ...(userIds?.length ? { id: { in: userIds } } : {}),
    },
    select: { id: true, name: true, username: true },
    orderBy: { name: "asc" },
  });

  for (const member of sales) {
    if (!usernameNeedsPinyinFix(member.username)) continue;
    const username = await allocatePinyinUsername(member.name, member.id);
    if (username !== member.username) {
      await db.user.update({
        where: { id: member.id },
        data: { username },
      });
    }
  }
}
