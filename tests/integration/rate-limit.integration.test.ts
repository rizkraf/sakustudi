import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeRedis, getRedisConnection } from "~/lib/queue/connection";
import { consumeRateLimit } from "~/lib/rate-limit/rate-limiter";

function uniqueKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

beforeAll(async () => {
  await getRedisConnection().ping();
});

afterAll(async () => {
  await closeRedis();
});

describe("consumeRateLimit", () => {
  it("allows up to the limit, then blocks with decreasing retry-after", async () => {
    const key = uniqueKey("test:consume");
    for (let i = 0; i < 3; i++) {
      const result = await consumeRateLimit(key, 60_000, 3);
      expect(result.allowed).toBe(true);
    }

    const blocked = await consumeRateLimit(key, 60_000, 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const afterOneSecond = await consumeRateLimit(key, 60_000, 3);
    expect(afterOneSecond.retryAfterSeconds).toBeLessThan(blocked.retryAfterSeconds);
  });

  it("keeps independent counters per key", async () => {
    const first = uniqueKey("test:independent-a");
    const second = uniqueKey("test:independent-b");
    await consumeRateLimit(first, 60_000, 1);
    expect((await consumeRateLimit(first, 60_000, 1)).allowed).toBe(false);
    expect((await consumeRateLimit(second, 60_000, 1)).allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    const key = uniqueKey("test:window");
    await consumeRateLimit(key, 1_000, 1);
    expect((await consumeRateLimit(key, 1_000, 1)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await consumeRateLimit(key, 1_000, 1)).allowed).toBe(true);
  });
});
