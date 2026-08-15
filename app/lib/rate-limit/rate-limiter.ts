import { getRedisConnection } from "~/lib/queue/connection";

/**
 * Atomic fixed-window counter: INCR, set EXPIRE on first hit, and compare
 * against the limit in one Lua execution so concurrent requests never race
 * past the limit.
 */
const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
if count <= tonumber(ARGV[2]) then
  return {1, -1}
end
return {0, redis.call("TTL", KEYS[1])}
`;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Consumes one slot of the fixed window for `key`. Fails open: a Redis
 * error never rejects — the request proceeds with a warning so the limiter
 * cannot take the app down with it.
 */
export async function consumeRateLimit(
  key: string,
  windowMs: number,
  limit: number,
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const result = (await getRedisConnection().eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      windowSeconds,
      limit,
    )) as [number, number];
    const [allowed, retry] = result;
    return { allowed: allowed === 1, retryAfterSeconds: Math.max(0, retry) };
  } catch (error) {
    console.warn(`rate-limit: redis unavailable for key "${key}", failing open`, error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
