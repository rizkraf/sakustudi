# Sakustudi Rate Limiting Implementation Plan (Fase A3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate limiting berbasis Redis: auth paths per-IP via express middleware, login per-email + upload per-user via route-action helpers. Fail-open, tanpa dependency baru.

**Architecture:** Core `consumeRateLimit(key, windowMs, limit)` memakai Lua script atomik (INCR+EXPIRE) di shared Redis connection (`getRedisConnection`). `rules.ts` murni memetakan method+path ke rule (unit-testable). Express middleware di `server/app.ts` melindungi `/login`, `/register`, `/forgot-password`, `/reset-password/*`, `/api/auth/*` per-IP. Helper `assertLoginRateLimit`/`assertUploadRateLimit` dipanggil di route action login dan upload, throw `AppError("RATE_LIMITED")` (sudah terpetakan ke 429 di `app/lib/errors/response.ts:54`).

**Tech Stack:** TypeScript, Express 5, ioredis (sudah dependency), Vitest (unit + integration), Redis lokal via `docker compose -f docker-compose.dev.yml up -d postgres redis`.

## Global Constraints

- Tanpa dependency baru; tanpa migration DB; tidak memakai rateLimit built-in Better Auth.
- Fail-open: error Redis → `console.warn` + allow; request tidak pernah gagal karena limiter.
- `RATE_LIMIT_ENABLED !== "false"` → aktif (default aktif).
- Env override: `RATE_LIMIT_<NAMA>_MAX`, nilai `0`/invalid/empty → pakai default.
- Default limits: login IP 20/10m, login email 5/10m, register 5/jam, forgot 5/jam, reset 10/jam, api auth 60/10m, upload 60/jam.
- Kunci limiter: `auth:login:ip:<ip>`, `auth:login:email:<lowercase>`, `auth:register:ip:<ip>`, `auth:forgot:ip:<ip>`, `auth:reset:ip:<ip>`, `auth:api:ip:<ip>`, `upload:user:<userId>`.
- `clientIp`: hop pertama `x-forwarded-for`, fallback `req.socket.remoteAddress`.
- Kode mengikuti gaya repo: JSDoc singkat pada fungsi exported.
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`.
- Integration test butuh Redis jalan; pakai key unik per test (prefix `randomUUID`) — tidak ada flushdb.

---

### Task 1: Rules murni — `app/lib/rate-limit/rules.ts`

**Files:**
- Create: `app/lib/rate-limit/rules.ts`
- Test: `tests/unit/rate-limit-rules.test.ts`

**Interfaces:**
- Produces:
  - `export type RateLimitRule = { keyPrefix: string; windowMs: number; limit: number }`
  - `export type MatchedRule = RateLimitRule & { kind: "ip" }`
  - `export function buildRules(env?: NodeJS.ProcessEnv): Map<string, MatchedRule>` — kunci `"METHOD PATH"` untuk path exact; `"* /api/auth/"` dan `"POST /reset-password/"` untuk prefix (lihat matcher).
  - `export function matchRateLimitRule(method: string, pathname: string, rules?: Map<string, MatchedRule>): RateLimitRule | null`
- Consumes: tidak ada (murni, no imports luar).

- [ ] **Step 1: Tulis test gagal dulu**

`tests/unit/rate-limit-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildRules, matchRateLimitRule } from "~/lib/rate-limit/rules";

describe("buildRules", () => {
  it("applies env overrides, defaulting on missing or invalid values", () => {
    const rules = buildRules({
      RATE_LIMIT_LOGIN_IP_MAX: "7",
      RATE_LIMIT_UPLOAD_MAX: "0",
      RATE_LIMIT_REGISTER_IP_MAX: "not-a-number",
      RATE_LIMIT_API_IP_MAX: "",
    } as NodeJS.ProcessEnv);

    expect(rules.get("POST /login")?.limit).toBe(7);
    expect(rules.get("POST /register")?.limit).toBe(5);
    expect(rules.get("* /api/auth/")?.limit).toBe(60);
  });
});

describe("matchRateLimitRule", () => {
  const rules = buildRules();

  it("matches exact POST routes", () => {
    expect(matchRateLimitRule("POST", "/login", rules)).toMatchObject({
      keyPrefix: "auth:login:ip",
      windowMs: 600_000,
      limit: 20,
    });
    expect(matchRateLimitRule("POST", "/register", rules)).toMatchObject({
      keyPrefix: "auth:register:ip",
    });
    expect(matchRateLimitRule("POST", "/forgot-password", rules)).toMatchObject({
      keyPrefix: "auth:forgot:ip",
    });
  });

  it("matches reset-password by prefix", () => {
    expect(matchRateLimitRule("POST", "/reset-password/abc123", rules)).toMatchObject({
      keyPrefix: "auth:reset:ip",
    });
  });

  it("matches any method on /api/auth prefix", () => {
    expect(matchRateLimitRule("GET", "/api/auth/get-session", rules)).toMatchObject({
      keyPrefix: "auth:api:ip",
    });
    expect(matchRateLimitRule("POST", "/api/auth/sign-in/email", rules)).toMatchObject({
      keyPrefix: "auth:api:ip",
    });
  });

  it("is case-insensitive for method", () => {
    expect(matchRateLimitRule("post", "/login", rules)).toMatchObject({
      keyPrefix: "auth:login:ip",
    });
  });

  it("returns null for unprotected routes and non-POST exact routes", () => {
    expect(matchRateLimitRule("GET", "/login", rules)).toBeNull();
    expect(matchRateLimitRule("POST", "/dashboard", rules)).toBeNull();
    expect(matchRateLimitRule("POST", "/api/auth/anything", rules)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project unit tests/unit/rate-limit-rules.test.ts`
Expected: FAIL — module `~/lib/rate-limit/rules` tidak ada.

- [ ] **Step 3: Buat `app/lib/rate-limit/rules.ts`**

```ts
export type RateLimitRule = {
  keyPrefix: string;
  windowMs: number;
  limit: number;
};

const DEFAULTS: Array<{ key: string; keyPrefix: string; windowMs: number; limit: number }> = [
  { key: "POST /login", keyPrefix: "auth:login:ip", windowMs: 600_000, limit: 20 },
  { key: "POST /register", keyPrefix: "auth:register:ip", windowMs: 3_600_000, limit: 5 },
  { key: "POST /forgot-password", keyPrefix: "auth:forgot:ip", windowMs: 3_600_000, limit: 5 },
  { key: "POST /reset-password/", keyPrefix: "auth:reset:ip", windowMs: 3_600_000, limit: 10 },
  { key: "* /api/auth/", keyPrefix: "auth:api:ip", windowMs: 600_000, limit: 60 },
];

const ENV_OVERRIDES: Record<string, { key: string; envName: string }> = {
  "POST /login": { key: "POST /login", envName: "RATE_LIMIT_LOGIN_IP_MAX" },
  "POST /register": { key: "POST /register", envName: "RATE_LIMIT_REGISTER_IP_MAX" },
  "POST /forgot-password": { key: "POST /forgot-password", envName: "RATE_LIMIT_FORGOT_IP_MAX" },
  "POST /reset-password/": { key: "POST /reset-password/", envName: "RATE_LIMIT_RESET_IP_MAX" },
  "* /api/auth/": { key: "* /api/auth/", envName: "RATE_LIMIT_API_IP_MAX" },
};

function envLimit(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildRules(env: NodeJS.ProcessEnv = process.env): Map<string, RateLimitRule> {
  const rules = new Map<string, RateLimitRule>();
  for (const rule of DEFAULTS) {
    const override = ENV_OVERRIDES[rule.key];
    rules.set(rule.key, {
      keyPrefix: rule.keyPrefix,
      windowMs: rule.windowMs,
      limit: override ? envLimit(env, override.envName, rule.limit) : rule.limit,
    });
  }
  return rules;
}

/**
 * Matches a request to its rate-limit rule, or null when the route is not
 * protected. Exact POST routes match first; `/reset-password/<token>` and
 * `/api/auth/*` match by path prefix (reset only for POST, api for any
 * method).
 */
export function matchRateLimitRule(
  method: string,
  pathname: string,
  rules: Map<string, RateLimitRule> = buildRules(),
): RateLimitRule | null {
  const normalized = method.toUpperCase();

  const exact = rules.get(`${normalized} ${pathname}`);
  if (exact) return exact;

  if (normalized === "POST" && pathname.startsWith("/reset-password/")) {
    return rules.get("POST /reset-password/") ?? null;
  }
  if (pathname.startsWith("/api/auth/")) {
    return rules.get("* /api/auth/") ?? null;
  }
  return null;
}
```

- [ ] **Step 4: Jalankan test, pastikan pass**

Run: `npx vitest run --project unit tests/unit/rate-limit-rules.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/rate-limit/rules.ts tests/unit/rate-limit-rules.test.ts
git commit -m "feat: add rate limit rule matching"
```

---

### Task 2: Core limiter Redis — `app/lib/rate-limit/rate-limiter.ts`

**Files:**
- Create: `app/lib/rate-limit/rate-limiter.ts`
- Test: `tests/integration/rate-limit.integration.test.ts`

**Interfaces:**
- Consumes: `getRedisConnection` dari `~/lib/queue/connection`.
- Produces:
  - `export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }`
  - `export async function consumeRateLimit(key: string, windowMs: number, limit: number): Promise<RateLimitResult>` — fail-open, tidak pernah throw.

- [ ] **Step 1: Tulis test gagal dulu**

`tests/integration/rate-limit.integration.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project integration tests/integration/rate-limit.integration.test.ts`
Expected: FAIL — module `~/lib/rate-limit/rate-limiter` tidak ada. (Pastikan Redis jalan: `docker compose -f docker-compose.dev.yml up -d postgres redis`.)

- [ ] **Step 3: Buat `app/lib/rate-limit/rate-limiter.ts`**

```ts
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
```

- [ ] **Step 4: Jalankan test, pastikan pass**

Run: `npx vitest run --project integration tests/integration/rate-limit.integration.test.ts`
Expected: PASS (3 tests). Catatan: test "resets after window" menunggu 1,1 dtk; window 1 dtk.

- [ ] **Step 5: Commit**

```bash
git add app/lib/rate-limit/rate-limiter.ts tests/integration/rate-limit.integration.test.ts
git commit -m "feat: add atomic redis rate limiter"
```

---

### Task 3: Express middleware + wiring `server/app.ts`

**Files:**
- Create: `app/lib/rate-limit/middleware.ts`
- Modify: `server/app.ts:10`
- Test: `tests/unit/rate-limit-middleware.test.ts`

**Interfaces:**
- Consumes: `matchRateLimitRule` (Task 1), `consumeRateLimit` (Task 2).
- Produces:
  - `export function clientIpFrom(req: { headers: { "x-forwarded-for"?: string | undefined }; socket?: { remoteAddress?: string } }): string`
  - `export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>` — never rejects; blocked → 429 + `Retry-After`; disabled → next.
  - `export const isRateLimitEnabled: boolean` — `process.env.RATE_LIMIT_ENABLED !== "false"`.

- [ ] **Step 1: Tulis test gagal dulu**

`tests/unit/rate-limit-middleware.test.ts` — middleware diuji dengan mock req/res (server/app.ts memakai virtual build, tidak bisa di-import):

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

import {
  clientIpFrom,
  rateLimitMiddleware,
  isRateLimitEnabled,
} from "~/lib/rate-limit/middleware";
import { consumeRateLimit } from "~/lib/rate-limit/rate-limiter";

vi.mock("~/lib/rate-limit/rate-limiter", () => ({
  consumeRateLimit: vi.fn(),
}));

const mockedConsume = vi.mocked(consumeRateLimit);

function makeRequest(method: string, path: string, headers: Record<string, string> = {}): Request {
  return {
    method,
    path,
    headers,
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as Request;
}

function makeResponse() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status: vi.fn(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    set: vi.fn(function (this: typeof res, name: string, value: string) {
      this.headers[name] = value;
      return this;
    }),
    json: vi.fn(),
    send: vi.fn(),
    type: vi.fn(function (this: typeof res) {
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clientIpFrom", () => {
  it("takes the first x-forwarded-for hop", () => {
    const req = makeRequest("POST", "/login", {
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
    });
    expect(clientIpFrom(req)).toBe("203.0.113.5");
  });

  it("falls back to remoteAddress", () => {
    expect(clientIpFrom(makeRequest("POST", "/login"))).toBe("10.0.0.1");
  });
});

describe("rateLimitMiddleware", () => {
  it("passes through unprotected routes", async () => {
    const next = vi.fn();
    const res = makeResponse();
    await rateLimitMiddleware(
      makeRequest("POST", "/dashboard"),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(next).toHaveBeenCalled();
    expect(mockedConsume).not.toHaveBeenCalled();
  });

  it("consumes a slot and calls next when allowed", async () => {
    mockedConsume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    const next = vi.fn();
    const res = makeResponse();
    await rateLimitMiddleware(
      makeRequest("POST", "/login", { "x-forwarded-for": "198.51.100.9" }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(mockedConsume).toHaveBeenCalledWith("auth:login:ip:198.51.100.9", 600_000, 20);
    expect(next).toHaveBeenCalled();
  });

  it("rejects with 429 and Retry-After when blocked", async () => {
    mockedConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const next = vi.fn();
    const res = makeResponse();
    await rateLimitMiddleware(
      makeRequest("POST", "/login"),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith("Retry-After", "42");
    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("never rejects when consumeRateLimit throws", async () => {
    mockedConsume.mockRejectedValue(new Error("redis down"));
    const next = vi.fn();
    const res = makeResponse();
    await expect(
      rateLimitMiddleware(
        makeRequest("POST", "/login"),
        res as unknown as Response,
        next as unknown as NextFunction,
      ),
    ).resolves.toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("is enabled by default", () => {
    expect(isRateLimitEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project unit tests/unit/rate-limit-middleware.test.ts`
Expected: FAIL — module `~/lib/rate-limit/middleware` tidak ada.

- [ ] **Step 3: Buat `app/lib/rate-limit/middleware.ts`**

```ts
import type { NextFunction, Request, Response } from "express";

import { consumeRateLimit } from "./rate-limiter";
import { matchRateLimitRule } from "./rules";

export const isRateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";

type HeaderShape = {
  headers: { "x-forwarded-for"?: string | undefined };
  socket?: { remoteAddress?: string };
};

/** First hop of X-Forwarded-For (set by the proxy), else the socket address. */
export function clientIpFrom(req: HeaderShape): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim() !== "") {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Express middleware protecting auth routes by client IP. Runs before the
 * React Router handler; blocked requests get a raw 429 + Retry-After. Fails
 * open on Redis errors and when disabled.
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isRateLimitEnabled) {
    next();
    return;
  }
  try {
    const rule = matchRateLimitRule(req.method, req.path);
    if (!rule) {
      next();
      return;
    }
    const result = await consumeRateLimit(
      `${rule.keyPrefix}:${clientIpFrom(req)}`,
      rule.windowMs,
      rule.limit,
    );
    if (result.allowed) {
      next();
      return;
    }
    res.status(429).set("Retry-After", String(result.retryAfterSeconds));
    if (req.path.startsWith("/api/")) {
      res.type("application/json").json({
        error: "Too many requests. Try again later.",
        retryAfterSeconds: result.retryAfterSeconds,
      });
    } else {
      res.type("text/plain").send("Too many requests. Try again later.");
    }
    console.warn(`rate-limit: blocked ${req.method} ${req.path} from ${clientIpFrom(req)}`);
  } catch (error) {
    console.warn("rate-limit: middleware error, failing open", error);
    next();
  }
}
```

- [ ] **Step 4: Pasang di `server/app.ts`**

Setelah `app.use(requestIdMiddleware);` (baris 10):

```ts
import { rateLimitMiddleware } from "~/lib/rate-limit/middleware";
...
app.use(requestIdMiddleware);
app.use(rateLimitMiddleware);
```

- [ ] **Step 5: Jalankan test, pastikan pass + verifikasi**

Run: `npx vitest run --project unit tests/unit/rate-limit-middleware.test.ts`
Expected: PASS (7 tests).

Run: `npm run typecheck && npm run lint`
Expected: PASS. (`isRateLimitEnabled` dipakai di middleware; tidak ada unused.)

- [ ] **Step 6: Commit**

```bash
git add app/lib/rate-limit/middleware.ts server/app.ts tests/unit/rate-limit-middleware.test.ts
git commit -m "feat: add rate limit middleware for auth routes"
```

---

### Task 4: Helper route-action — login per-email + upload per-user

**Files:**
- Create: `app/lib/rate-limit/assertions.ts`
- Modify: `app/routes/login.tsx:15-21`
- Modify: `app/routes/activities.$activityId.tsx:105-116`
- Modify: `app/routes/notes.$noteId.tsx:116-123`
- Test: `tests/integration/rate-limit-assertions.integration.test.ts`

**Interfaces:**
- Consumes: `consumeRateLimit` (Task 2), `AppError` (`~/lib/errors/AppError`).
- Produces:
  - `export async function assertLoginRateLimit(email: string): Promise<void>` — key `auth:login:email:<lowercase>`, 5 / 600_000 ms; blocked → throw `AppError("RATE_LIMITED", "Too many sign-in attempts. Try again later.")`.
  - `export async function assertUploadRateLimit(userId: string): Promise<void>` — key `upload:user:<userId>`, 60 / 3_600_000 ms; blocked → throw `AppError("RATE_LIMITED", "Too many uploads. Try again later.")`.

- [ ] **Step 1: Tulis test gagal dulu**

`tests/integration/rate-limit-assertions.integration.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project integration tests/integration/rate-limit-assertions.integration.test.ts`
Expected: FAIL — module `~/lib/rate-limit/assertions` tidak ada.

- [ ] **Step 3: Buat `app/lib/rate-limit/assertions.ts`**

```ts
import { AppError } from "~/lib/errors/AppError";
import { consumeRateLimit } from "./rate-limiter";

const LOGIN_EMAIL_WINDOW_MS = 600_000;
const LOGIN_EMAIL_LIMIT = 5;
const UPLOAD_WINDOW_MS = 3_600_000;
const UPLOAD_LIMIT = 60;

function loginEmailLimit(): number {
  const raw = process.env.RATE_LIMIT_LOGIN_EMAIL_MAX;
  if (raw === undefined || raw === "") return LOGIN_EMAIL_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LOGIN_EMAIL_LIMIT;
}

function uploadLimit(): number {
  const raw = process.env.RATE_LIMIT_UPLOAD_MAX;
  if (raw === undefined || raw === "") return UPLOAD_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : UPLOAD_LIMIT;
}

/**
 * Route-action guard for the login form: per-email counter that stops
 * password brute force on a single account even from many IPs.
 */
export async function assertLoginRateLimit(email: string): Promise<void> {
  const result = await consumeRateLimit(
    `auth:login:email:${email.trim().toLowerCase()}`,
    LOGIN_EMAIL_WINDOW_MS,
    loginEmailLimit(),
  );
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Try again later.");
  }
}

/** Route-action guard for uploads: per-user upload quota per hour. */
export async function assertUploadRateLimit(userId: string): Promise<void> {
  const result = await consumeRateLimit(
    `upload:user:${userId}`,
    UPLOAD_WINDOW_MS,
    uploadLimit(),
  );
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many uploads. Try again later.");
  }
}
```

- [ ] **Step 4: Wire login — `app/routes/login.tsx`**

Dalam `action`, setelah `const email = ...` (baris 17), sebelum `try`:

```ts
  await assertLoginRateLimit(email);
```

Tambah import:

```ts
import { assertLoginRateLimit } from "~/lib/rate-limit/assertions";
```

- [ ] **Step 5: Wire upload activities — `app/routes/activities.$activityId.tsx`**

Di branch `if (intent === "attach-file")`, sebelum `createAttachment` (baris 108):

```ts
      await assertUploadRateLimit(user.id);
```

Tambah import:

```ts
import { assertUploadRateLimit } from "~/lib/rate-limit/assertions";
```

- [ ] **Step 6: Wire upload notes — `app/routes/notes.$noteId.tsx`**

Di branch `if (intent === "attach-file")`, sebelum `createAttachment` (baris 119):

```ts
      await assertUploadRateLimit(user.id);
```

Tambah import:

```ts
import { assertUploadRateLimit } from "~/lib/rate-limit/assertions";
```

- [ ] **Step 7: Verifikasi**

Run: `npx vitest run --project integration tests/integration/rate-limit-assertions.integration.test.ts`
Expected: PASS (3 tests).

Run: `npm run typecheck && npm run lint`
Expected: PASS.

Run: `npm run test:integration`
Expected: PASS (semua file; assertions test baru ikut).

- [ ] **Step 8: Commit**

```bash
git add app/lib/rate-limit/assertions.ts app/routes/login.tsx app/routes/activities.\$activityId.tsx app/routes/notes.\$noteId.tsx tests/integration/rate-limit-assertions.integration.test.ts
git commit -m "feat: rate limit login per email and uploads per user"
```

---

### Task 5: Env, E2E, dokumentasi

**Files:**
- Modify: `.env.example`
- Modify: `playwright.config.ts:22-27`
- Create: `docs/operations/rate-limiting.md`

**Interfaces:**
- Consumes: env names dari Task 1 (`RATE_LIMIT_LOGIN_IP_MAX`, `RATE_LIMIT_REGISTER_IP_MAX`, `RATE_LIMIT_FORGOT_IP_MAX`, `RATE_LIMIT_RESET_IP_MAX`, `RATE_LIMIT_API_IP_MAX`) dan Task 4 (`RATE_LIMIT_LOGIN_EMAIL_MAX`, `RATE_LIMIT_UPLOAD_MAX`), plus `RATE_LIMIT_ENABLED`.

- [ ] **Step 1: `.env.example`**

Tambahkan section baru setelah blok Redis (baris 8):

```env
# Rate limiting (Redis-backed, fail-open). Set RATE_LIMIT_ENABLED=false to
# disable (e.g. for automated tests). Each RATE_LIMIT_*_MAX overrides the
# default; 0 or empty keeps the default.
RATE_LIMIT_ENABLED=true
RATE_LIMIT_LOGIN_IP_MAX=20
RATE_LIMIT_LOGIN_EMAIL_MAX=5
RATE_LIMIT_REGISTER_IP_MAX=5
RATE_LIMIT_FORGOT_IP_MAX=5
RATE_LIMIT_RESET_IP_MAX=10
RATE_LIMIT_API_IP_MAX=60
RATE_LIMIT_UPLOAD_MAX=60
```

- [ ] **Step 2: `playwright.config.ts`**

Di blok `env` webServer (baris 22-27), tambahkan:

```ts
      RATE_LIMIT_ENABLED: "false",
```

- [ ] **Step 3: Buat `docs/operations/rate-limiting.md`**

```markdown
# Rate Limiting

Rate limiting berbasis Redis (Lua INCR+EXPIRE atomik) untuk melindungi
endpoint auth dan upload. Fail-open: jika Redis tidak tersedia, request
diproses normal dengan warning — limiter tidak pernah mematikan aplikasi.

## Cakupan

| Target | Key | Default |
| --- | --- | --- |
| POST `/login` (per-IP) | `auth:login:ip:<ip>` | 20 / 10 menit |
| POST `/login` (per-email) | `auth:login:email:<email>` | 5 / 10 menit |
| POST `/register` (per-IP) | `auth:register:ip:<ip>` | 5 / jam |
| POST `/forgot-password` (per-IP) | `auth:forgot:ip:<ip>` | 5 / jam |
| POST `/reset-password/*` (per-IP) | `auth:reset:ip:<ip>` | 10 / jam |
| `/api/auth/*` (per-IP) | `auth:api:ip:<ip>` | 60 / 10 menit |
| Upload file (per-user) | `upload:user:<userId>` | 60 / jam |

Login per-email case-insensitive (email di-lowercase). Client IP diambil
dari hop pertama `X-Forwarded-For` (set proxy), fallback ke socket address.

## Konfigurasi

Semua variabel opsional; `0`/kosong = default. `RATE_LIMIT_ENABLED=false`
mematikan semua limiter (dipakai E2E).

| Variabel | Default |
| --- | --- |
| `RATE_LIMIT_ENABLED` | `true` |
| `RATE_LIMIT_LOGIN_IP_MAX` | 20 |
| `RATE_LIMIT_LOGIN_EMAIL_MAX` | 5 |
| `RATE_LIMIT_REGISTER_IP_MAX` | 5 |
| `RATE_LIMIT_FORGOT_IP_MAX` | 5 |
| `RATE_LIMIT_RESET_IP_MAX` | 10 |
| `RATE_LIMIT_API_IP_MAX` | 60 |
| `RATE_LIMIT_UPLOAD_MAX` | 60 |

## Perilaku saat limit tercapai

- Middleware express: HTTP 429 + header `Retry-After` (JSON untuk
  `/api/*`, teks untuk halaman SSR) + log warning.
- Aksi login/upload: `AppError("RATE_LIMITED")` dirender 429 dengan pesan
  formulir oleh `app/lib/errors/response.ts`.

## Catatan

- Tidak memakai rate limit built-in Better Auth (memory storage
  per-proses, tidak konsisten antar instance).
- Storage satu-satunya: Redis yang sama dengan BullMQ
  (`app/lib/queue/connection.ts`).
- Implementasi: `app/lib/rate-limit/` (`rate-limiter.ts`,
  `rules.ts`, `middleware.ts`, `assertions.ts`).
```

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: PASS.

Opsional (butuh Redis + worker tidak jalan): `npm run test:e2e -- tests/e2e/auth.spec.ts`
Expected: PASS — pastikan tidak ada worker stale (lihat AGENTS.md).

```bash
git add .env.example playwright.config.ts docs/operations/rate-limiting.md
git commit -m "docs: document rate limiting config and add e2e disable"
```

---

## Self-Review Checklist

- [ ] Spec coverage: rules (Task 1), core limiter (Task 2), middleware + wiring (Task 3), assertions login/upload (Task 4), env + docs + E2E (Task 5). Semua bagian spec punya task.
- [ ] Tanpa placeholder: semua task punya kode lengkap.
- [ ] Type consistency: `consumeRateLimit(key, windowMs, limit)` dipakai konsisten; `matchRateLimitRule(method, pathname, rules?)` sama di Task 1 dan 3; `isRateLimitEnabled` diekspor dan dipakai Task 3.
- [ ] Env names konsisten: Task 1/4 membaca `RATE_LIMIT_*_MAX`, Task 5 mendokumentasikan nama yang sama.
- [ ] Test middleware memakai mock `consumeRateLimit` (unit); core + assertions diuji integration terhadap Redis asli.
- [ ] Fail-open di semua lapisan (core catch, middleware catch).
