import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const username = process.argv[2];
const password = process.argv[3] ?? "123456";

async function main() {
  if (!username) {
    console.error("用法: npx tsx scripts/enable-manager.ts <登录名> [密码]");
    process.exit(1);
  }

  const user = await db.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`未找到用户: ${username}`);
    process.exit(1);
  }
  if (user.role !== "MANAGER") {
    console.error(`${username} 不是区域经理账号`);
    process.exit(1);
  }
  if (user.accountLifecycle !== "IMPORTED" || user.passwordHash) {
    console.error(`${username} 当前状态为 ${user.accountLifecycle}，无需重复开通`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      accountLifecycle: "ACTIVE",
    },
  });

  console.log(`已开通经理账号: ${user.name}（${username}），密码: ${password}`);
  console.log("与管理员「开通账号」一致：对方可立即登录经理端，无需额外认证步骤。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
