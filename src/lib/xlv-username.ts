import { db } from "@/lib/db";
import { chineseNameToPinyinUsername } from "@/lib/pinyin-username";

/** 小绿盒登录名：仅在 XlvMemberAccount 内唯一（与支付宝 User 账号空间独立） */
export async function allocateXlvPinyinUsername(
  name: string,
  excludeAccountId?: string
): Promise<string> {
  const base = chineseNameToPinyinUsername(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const conflict = await db.xlvMemberAccount.findFirst({
      where: {
        username: candidate,
        ...(excludeAccountId ? { NOT: { id: excludeAccountId } } : {}),
      },
      select: { id: true },
    });
    if (!conflict) return candidate;
    candidate = `${base}${suffix++}`;
  }
}

/** 将误加后缀的登录名收回纯拼音（小绿盒内无重名时） */
export async function reconcileXlvPinyinUsernames() {
  const accounts = await db.xlvMemberAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, username: true },
  });
  let renamed = 0;
  for (const account of accounts) {
    const base = chineseNameToPinyinUsername(account.name);
    if (account.username === base) continue;
    const conflict = await db.xlvMemberAccount.findFirst({
      where: { username: base, NOT: { id: account.id } },
      select: { id: true },
    });
    if (!conflict) {
      await db.xlvMemberAccount.update({
        where: { id: account.id },
        data: { username: base },
      });
      renamed += 1;
    }
  }
  return { renamed };
}
