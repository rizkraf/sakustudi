import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeRedis, getRedisConnection } from "~/lib/queue/connection";
import {
  assertLoginRateLimit,
  assertUploadRateLimit,
} from "~/lib/rate-limit/assertions";

async function expectRateLimited(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    expect.unreachable("expected RATE_LIMITED error");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const candidate = error as { code?: string };
    expect(candidate.code).toBe("RATE_LIMITED");
  }
}

beforeAll(async () => {
  await getRedisConnection().ping();
});

afterAll(async () => {
  await closeRedis();
});

describe("assertLoginRateLimit", () => {
  it("blocks after 5 attempts per email (case-insensitive)", async () => {
    const email = `Login-${crypto.randomUUID()}@test.dev`;
    for (let i = 0; i < 5; i++) {
      await expect(assertLoginRateLimit(email)).resolves.toBeUndefined();
    }
    await expectRateLimited(assertLoginRateLimit(email));
    // Keyed lowercased: a differently-cased address shares the counter.
    await expectRateLimited(assertLoginRateLimit(email.toLowerCase()));
  });

  it("keeps different emails independent", async () => {
    const first = `a-${crypto.randomUUID()}@test.dev`;
    const second = `b-${crypto.randomUUID()}@test.dev`;
    for (let i = 0; i < 5; i++) {
      await expect(assertLoginRateLimit(first)).resolves.toBeUndefined();
    }
    await expectRateLimited(assertLoginRateLimit(first));
    await expect(assertLoginRateLimit(second)).resolves.toBeUndefined();
  });
});

describe("assertUploadRateLimit", () => {
  it("blocks after 60 uploads per user", async () => {
    const userId = crypto.randomUUID();
    for (let i = 0; i < 60; i++) {
      await expect(assertUploadRateLimit(userId)).resolves.toBeUndefined();
    }
    await expectRateLimited(assertUploadRateLimit(userId));
  });
});
