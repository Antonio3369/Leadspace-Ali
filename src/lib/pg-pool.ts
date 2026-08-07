import { Pool } from "pg";

/** Prisma Dev 本地沙箱建议 connection_limit≤10，过高并发会把连接打挂 */
function withDevPoolLimits(connectionString: string) {
  const url = new URL(connectionString);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "8");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "30");
  }
  return url.toString();
}

const globalForPg = globalThis as unknown as { pgPool?: Pool };

/** 全应用共享 pg Pool，避免 dev 热更新多池 + Prisma adapter prepared statement 错乱 */
export function getPgPool() {
  const cached = globalForPg.pgPool;
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString: withDevPoolLimits(connectionString),
    max: 8,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPg.pgPool = pool;
  }

  return pool;
}
