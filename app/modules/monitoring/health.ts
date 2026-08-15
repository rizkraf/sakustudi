import { sql } from "drizzle-orm";
import { Queue } from "bullmq";

import { getDb } from "~/lib/db/client";
import { getRedisConnection } from "~/lib/queue/connection";
import { QUEUE_NAMES } from "~/lib/queue/names";
import { HEARTBEAT_KEY } from "~/lib/monitoring/heartbeat";

export type HealthStatus = "ok" | "degraded" | "down";

export type WorkerHeartbeat = {
  running: boolean;
  lastSeenAt: string | null;
  ageSeconds: number | null;
};

export type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

export type FailedJobSummary = {
  id: string;
  name: string;
  attemptsMade: number;
  timestamp: number;
  finishedOn: number | null;
};

export type QueueSnapshot = {
  name: string;
  counts: QueueCounts;
  recentFailed: FailedJobSummary[];
  /** True when the snapshot read itself failed; counts are zeroed. */
  error?: boolean;
};

export type ReadinessReport = {
  status: HealthStatus;
  checks: {
    db: { ok: boolean };
    redis: { ok: boolean };
    worker: WorkerHeartbeat;
  };
  queues: QueueSnapshot[];
  checkedAt: string;
};

/** Pure status classification; unit-tested. */
export function classifyHealthStatus(
  dbOk: boolean,
  redisOk: boolean,
  workerRunning: boolean,
  hasFailedJobs: boolean,
): HealthStatus {
  if (!dbOk || !redisOk) return "down";
  if (!workerRunning || hasFailedJobs) return "degraded";
  return "ok";
}

async function checkDb(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    await getRedisConnection().ping();
    return true;
  } catch {
    return false;
  }
}

export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat> {
  try {
    const redis = getRedisConnection();
    const [raw, ttl] = await Promise.all([
      redis.get(HEARTBEAT_KEY),
      redis.ttl(HEARTBEAT_KEY),
    ]);
    if (raw === null) {
      return { running: false, lastSeenAt: null, ageSeconds: null };
    }
    const lastSeenAt = new Date(raw);
    if (Number.isNaN(lastSeenAt.getTime())) {
      return { running: false, lastSeenAt: raw, ageSeconds: null };
    }
    const ageSeconds = Math.max(
      0,
      Math.round((Date.now() - lastSeenAt.getTime()) / 1000),
    );
    return { running: ttl > 0, lastSeenAt: raw, ageSeconds };
  } catch {
    return { running: false, lastSeenAt: null, ageSeconds: null };
  }
}

/**
 * BullMQ snapshots per queue. Queue instances are opened and closed around
 * the read; closing a queue never quits the shared Redis connection.
 * Failed-job summaries carry metadata only — never payload or reason.
 */
export async function getQueueSnapshots(): Promise<QueueSnapshot[]> {
  const connection = getRedisConnection();
  const snapshots: QueueSnapshot[] = [];
  for (const name of Object.values(QUEUE_NAMES)) {
    const queue = new Queue(name, { connection });
    try {
      const [counts, failedJobs] = await Promise.all([
        queue.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
        queue.getJobs("failed", 0, 5),
      ]);
      snapshots.push({
        name,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
        },
        recentFailed: failedJobs.map((job) => ({
          id: job.id ?? "unknown",
          name: job.name,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          finishedOn: job.finishedOn ?? null,
        })),
      });
    } catch (error) {
      console.warn(`monitoring: queue snapshot failed for "${name}"`, error);
      snapshots.push({
        name,
        counts: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
        recentFailed: [],
        error: true,
      });
    } finally {
      await queue.close();
    }
  }
  return snapshots;
}

/** Full readiness report for /healthz/ready. */
export async function checkReadiness(): Promise<ReadinessReport> {
  const [dbOk, redisOk, worker, queues] = await Promise.all([
    checkDb(),
    checkRedis(),
    readWorkerHeartbeat(),
    getQueueSnapshots(),
  ]);
  const status = classifyHealthStatus(
    dbOk,
    redisOk,
    worker.running,
    queues.some((queue) => queue.counts.failed > 0 || queue.error === true),
  );
  return {
    status,
    checks: { db: { ok: dbOk }, redis: { ok: redisOk }, worker },
    queues,
    checkedAt: new Date().toISOString(),
  };
}
