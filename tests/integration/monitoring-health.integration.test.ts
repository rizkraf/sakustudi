import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import { closeRedis, getRedisConnection } from "~/lib/queue/connection";
import {
  HEARTBEAT_KEY,
  startHeartbeat,
} from "~/lib/monitoring/heartbeat";
import {
  checkReadiness,
  getQueueSnapshots,
  readWorkerHeartbeat,
} from "~/modules/monitoring/health";

beforeAll(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  await getRedisConnection().ping();
});

afterAll(async () => {
  await closeRedis();
  await closeDb();
});

describe("readWorkerHeartbeat", () => {
  it("reports running when the key exists with TTL, stale otherwise", async () => {
    const heartbeat = await startHeartbeat();
    try {
      const alive = await readWorkerHeartbeat();
      expect(alive.running).toBe(true);
      expect(alive.lastSeenAt).toBeTruthy();
      expect(alive.ageSeconds).toBeLessThanOrEqual(5);
    } finally {
      await heartbeat.stop();
    }

    const gone = await readWorkerHeartbeat();
    expect(gone.running).toBe(false);
    expect(gone.lastSeenAt).toBeNull();
    expect(gone.ageSeconds).toBeNull();
  });
});

describe("getQueueSnapshots", () => {
  it("returns the four queues with counts and metadata-only failed jobs", async () => {
    const snapshots = await getQueueSnapshots();
    expect(snapshots.map((s) => s.name).sort()).toEqual(
      ["reminders", "emails", "exports", "cleanup"].sort(),
    );
    for (const snapshot of snapshots) {
      expect(snapshot.counts).toMatchObject({
        waiting: expect.any(Number),
        active: expect.any(Number),
        delayed: expect.any(Number),
        failed: expect.any(Number),
        completed: expect.any(Number),
      });
      for (const job of snapshot.recentFailed) {
        expect(job).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            attemptsMade: expect.any(Number),
            timestamp: expect.any(Number),
          }),
        );
        expect(job).not.toHaveProperty("payload");
        expect(job).not.toHaveProperty("failedReason");
      }
    }
  });
});

describe("checkReadiness", () => {
  it("reports ok (or degraded from leftover failed jobs) with live infra", async () => {
    const report = await checkReadiness();
    expect(report.checks.db.ok).toBe(true);
    expect(report.checks.redis.ok).toBe(true);
    expect(report.checkedAt).toBeTruthy();
    expect(["ok", "degraded"]).toContain(report.status);
  });

  it("reports the worker stale when the heartbeat key is absent", async () => {
    const redis = getRedisConnection();
    await redis.del(HEARTBEAT_KEY);
    const report = await checkReadiness();
    expect(report.checks.worker.running).toBe(false);
    expect(["degraded", "down"]).toContain(report.status);
  });
});
