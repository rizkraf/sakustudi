import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeRedis, getRedisConnection } from "~/lib/queue/connection";
import {
  HEARTBEAT_KEY,
  startHeartbeat,
} from "~/lib/monitoring/heartbeat";

beforeAll(async () => {
  await getRedisConnection().ping();
});

afterAll(async () => {
  await closeRedis();
});

describe("worker heartbeat", () => {
  it("writes a timestamped key with a TTL and reads back", async () => {
    const heartbeat = await startHeartbeat();
    try {
      const redis = getRedisConnection();
      const raw = await redis.get(HEARTBEAT_KEY);
      const ttl = await redis.ttl(HEARTBEAT_KEY);
      expect(raw).toBeTruthy();
      expect(Number.isNaN(Date.parse(raw!))).toBe(false);
      expect(ttl).toBeGreaterThan(0);
    } finally {
      await heartbeat.stop();
    }
  });

  it("stop() clears the key", async () => {
    const heartbeat = await startHeartbeat();
    await heartbeat.stop();
    const redis = getRedisConnection();
    expect(await redis.get(HEARTBEAT_KEY)).toBeNull();
    // stop() is idempotent and never rejects.
    await expect(heartbeat.stop()).resolves.toBeUndefined();
  });
});
