import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schema } from "./schema";
import type { AppSchema } from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://sakustudi:sakustudi@localhost:5432/sakustudi";

function toInt(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: toInt(process.env.DATABASE_POOL_MAX, 10),
  idleTimeoutMillis: toInt(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS, 30_000),
});

export const db: NodePgDatabase<AppSchema> = drizzle(pool, { schema });

export function getDb(): NodePgDatabase<AppSchema> {
  return db;
}

export function closeDb(): Promise<void> {
  return pool.end();
}
