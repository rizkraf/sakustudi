import { getRedisConnection } from "~/lib/queue/connection";

export const HEARTBEAT_KEY = "sakustudi:worker:heartbeat";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_TTL_S = 90;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type HeartbeatHandle = {
  /** Clears the interval and removes the key. Idempotent, never rejects. */
  stop: () => Promise<void>;
};

/**
 * Periodically writes the worker liveness key so the web process can report
 * worker status on /healthz/ready. Fail-open: a Redis hiccup logs a warning
 * instead of crashing the worker.
 */
export async function startHeartbeat(): Promise<HeartbeatHandle> {
  const intervalMs = envInt("WORKER_HEARTBEAT_INTERVAL_MS", DEFAULT_INTERVAL_MS);
  const ttlSeconds = envInt("WORKER_HEARTBEAT_TTL_S", DEFAULT_TTL_S);
  const redis = getRedisConnection();

  const beat = async (): Promise<void> => {
    try {
      await redis.set(HEARTBEAT_KEY, new Date().toISOString(), "EX", ttlSeconds);
    } catch (error) {
      console.warn("worker: heartbeat write failed", error);
    }
  };

  await beat();
  const timer = setInterval(beat, intervalMs);
  timer.unref();

  return {
    stop: async (): Promise<void> => {
      clearInterval(timer);
      await redis.del(HEARTBEAT_KEY).catch(() => undefined);
    },
  };
}
