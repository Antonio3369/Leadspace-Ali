import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getPgPool } from "@/lib/pg-pool";

export function createPrismaClient() {
  const adapter = new PrismaPg(getPgPool());
  return new PrismaClient({ adapter });
}

/** 热更新后 global 里可能仍是旧 Prisma Client（缺新 model delegate） */
function isPrismaClientCurrent(client: PrismaClient) {
  return (
    typeof client.xlvTeamRoster?.findMany === "function" &&
    typeof client.xlvDeviceRecord?.findMany === "function"
  );
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  if (cached && isPrismaClientCurrent(cached)) {
    return cached;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const db = getPrismaClient();
