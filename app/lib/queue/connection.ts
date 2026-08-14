import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let connection: IORedis | undefined;

/**
 * Shared Redis connection for every BullMQ queue and worker. BullMQ requires
 * `maxRetriesPerRequest: null` so workers keep their blocking BRPOP alive
 * across transient Redis failures; the default retry strategy reconnects
 * forever, which is what lets reconciliation pick up after Redis recovery.
 */
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }
  return connection;
}

/**
 * Idempotent shutdown: workers and queues close their halves of the shared
 * connection first (BullMQ close() on an externally supplied connection does
 * not quit it), then this quits it for real. Safe to call multiple times.
 */
export async function closeRedis(): Promise<void> {
  if (!connection) return;
  const redis = connection;
  connection = undefined;
  if (redis.status !== "end") {
    await redis.quit().catch(() => redis.disconnect());
  }
}
