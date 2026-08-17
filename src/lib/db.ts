import { Pool } from "pg";
import { env } from "./env";

/**
 * PostgreSQL 连接池（单例）。
 * 全局复用，避免 dev 模式下热重载反复建连接。
 */
const globalForPg = globalThis as unknown as { __gscPool?: Pool };

export const pool =
  globalForPg.__gscPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.__gscPool = pool;

/** 健康检查：SELECT 1，返回 true/false */
export async function checkDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** 在事务中执行回调，失败自动回滚 */
export async function withTransaction<T>(
  fn: (client: { query: typeof pool.query }) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** 优雅退出 */
export async function closeDb(): Promise<void> {
  await pool.end();
}
