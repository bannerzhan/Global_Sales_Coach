import { checkDb } from "../db";
import { env } from "../env";

/**
 * 存储后端选择器。
 * - DB 可用（部署环境，docker compose 起 PostgreSQL）→ PostgreSQL
 * - DB 不可用（本机无 Docker 的开发环境）→ 本地 JSON 文件（.local-data/data.json）
 *
 * 设计意图：可观测性/业务数据都不能被"本机没装 DB"卡住开发；
 * 两种后端暴露同一套 repo 接口，部署后零改动切到 PG。
 */

// ---- DB 可用性缓存：checkDb 打一次 SELECT 1，失败后 30s 内不再重试 ----
let dbAvailable: boolean | null = null;
let dbCheckedAt = 0;
const DB_RECHECK_MS = 30_000;

export async function isDbAvailable(): Promise<boolean> {
  const now = Date.now();
  if (dbAvailable !== null && now - dbCheckedAt < DB_RECHECK_MS) return dbAvailable;
  dbAvailable = await checkDb();
  dbCheckedAt = now;
  return dbAvailable;
}

/** 单用户 id：本地模式固定用 "1"；DB 模式用 email 解析出的真实 UUID */
export const LOCAL_USER_ID = "1";

// ---- 本地 JSON 存储 ----
import { promises as fs } from "fs";
import path from "path";

const LOCAL_DATA_DIR = path.join(process.cwd(), ".local-data");
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, "data.json");

interface LocalData {
  users: Record<string, Record<string, unknown>>;
}

async function readLocal(): Promise<LocalData> {
  try {
    const raw = await fs.readFile(LOCAL_DATA_FILE, "utf8");
    return JSON.parse(raw) as LocalData;
  } catch {
    return { users: {} };
  }
}

let writeQueue: Promise<void> = Promise.resolve();
async function writeLocal(data: LocalData): Promise<void> {
  await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
  const json = JSON.stringify(data, null, 2);
  // 串行化写入，避免并发覆盖（本地单用户场景足够）
  writeQueue = writeQueue.then(() => fs.writeFile(LOCAL_DATA_FILE, json, "utf8"));
  await writeQueue;
}

export async function localGetUser(
  userId: string,
): Promise<Record<string, unknown> | undefined> {
  const data = await readLocal();
  return data.users[userId];
}

export async function localSaveUser(
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const data = await readLocal();
  const existing = data.users[userId] ?? { userId };
  data.users[userId] = { ...existing, ...patch };
  await writeLocal(data);
}

// ---- DB 模式的单用户解析：email → users 表 UUID（不存在则插入） ----
import { pool } from "../db";

let cachedUserId: string | null = null;
export async function getOrCreateUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const email = env.AUTH_USER_EMAIL.trim().toLowerCase();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'user')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email, env.AUTH_USER_PASSWORD_HASH],
  );
  cachedUserId = rows[0].id;
  return cachedUserId;
}

// ---- 公共辅助：消除 repo 层重复样板 ----

/**
 * 统一 userId fallback：本地模式用 LOCAL_USER_ID（"1"），DB 模式用真实 UUID。
 * 取代各处散落的 `userId ?? LOCAL_USER_ID` 与 `userId ?? (await getOrCreateUserId())`，
 * 避免两套 fallback 语义分裂导致的"查不到自己数据"类 bug。
 */
export async function resolveUid(userId?: string): Promise<string> {
  if (userId) return userId;
  if (await isDbAvailable()) return getOrCreateUserId();
  return LOCAL_USER_ID;
}

/** 本地模式读取某用户数据（不存在返回带 userId 的空对象，省去每处 `?? {userId}`） */
export async function readLocalUser(userId: string): Promise<Record<string, unknown>> {
  return (await localGetUser(userId)) ?? { userId };
}

/** 本地模式合并写入某用户数据 */
export async function patchLocalUser(
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const existing = await readLocalUser(userId);
  await localSaveUser(userId, { ...existing, ...patch });
}
