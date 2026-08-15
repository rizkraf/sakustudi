# Sakustudi Monitoring Implementation Plan (Fase A3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worker heartbeat ke Redis + endpoint `/healthz/ready` (DB/Redis/worker/queue) + worker healthcheck Docker.

**Architecture:** Worker menulis `SET sakustudi:worker:heartbeat <ISO> EX 90` tiap 30s (env-override), dihapus saat shutdown. Module `app/modules/monitoring/health.ts` menyusun laporan readiness: `SELECT 1` (pool), `PING` (shared Redis), TTL heartbeat, dan BullMQ queue snapshots (counts + 5 failed jobs metadata-only). Route `healthz/ready` → 503 bila DB/Redis down, 200 selebihnya. Worker service di compose dapat healthcheck inline node (ioredis dependency produksi).

**Tech Stack:** TypeScript, BullMQ, ioredis, Drizzle (`getDb`), Vitest integration (Redis + PostgreSQL), Docker Compose.

## Global Constraints

- Tanpa dependency baru; tanpa migration; `/healthz` tidak berubah.
- Privasi: endpoint readiness TIDAK pernah menyertakan payload job atau `failedReason` — hanya `{ id, name, attemptsMade, timestamp, finishedOn }`.
- Heartbeat key: `sakustudi:worker:heartbeat`; default interval 30.000ms, TTL 90s; env `WORKER_HEARTBEAT_INTERVAL_MS`, `WORKER_HEARTBEAT_TTL_S`.
- Shared Redis connection tidak pernah di-`quit` oleh queue/worker yang dibuka di dalam fungsi (pakai `close()`, bukan `quit()`).
- `checkReadiness` status: `"down"` bila db/redis gagal; `"degraded"` bila worker stale atau ada failed jobs; `"ok"` selebihnya. HTTP: `down` → 503, lainnya → 200.
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration` (butuh `docker compose -f docker-compose.dev.yml up -d postgres redis`).
- Kode gaya repo: JSDoc singkat pada fungsi exported.

---

### Task 1: Heartbeat worker — `app/lib/monitoring/heartbeat.ts` + wiring `worker/index.ts`

**Files:**
- Create: `app/lib/monitoring/heartbeat.ts`
- Modify: `worker/index.ts`
- Test: `tests/integration/monitoring-heartbeat.integration.test.ts`

**Interfaces:**
- Consumes: `getRedisConnection` (`~/lib/queue/connection`).
- Produces:
  - `export const HEARTBEAT_KEY = "sakustudi:worker:heartbeat"`
  - `export type HeartbeatHandle = { stop: () => Promise<void> }`
  - `export async function startHeartbeat(): Promise<HeartbeatHandle>` — tulis heartbeat segera, lalu tiap interval; `stop()` clear interval + `DEL` key (idempotent, tidak pernah reject).

- [ ] **Step 1: Tulis test gagal dulu**

`tests/integration/monitoring-heartbeat.integration.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project integration tests/integration/monitoring-heartbeat.integration.test.ts`
Expected: FAIL — module `~/lib/monitoring/heartbeat` tidak ada.

- [ ] **Step 3: Buat `app/lib/monitoring/heartbeat.ts`**

```ts
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
```

- [ ] **Step 4: Jalankan test, pastikan pass**

Run: `npx vitest run --project integration tests/integration/monitoring-heartbeat.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire `worker/index.ts`**

Imports (tambah setelah import `installShutdown`):

```ts
import { startHeartbeat } from "~/lib/monitoring/heartbeat";
```

Di `main()`, sebelum `installShutdown(...)` (sekitar baris 122):

```ts
  const heartbeat = await startHeartbeat();
```

Ubah pemanggilan `installShutdown` (baris 122-125) menjadi:

```ts
  installShutdown({
    workers: [remindersWorker, emailsWorker, cleanupWorker, exportsWorker],
    onClose: async () => {
      await heartbeat.stop();
      await closeDb();
    },
  });
```

- [ ] **Step 6: Verifikasi**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. (`npm run test:integration` penuh juga harus hijau — Task 2/3 akan menambah file baru.)

- [ ] **Step 7: Commit**

```bash
git add app/lib/monitoring/heartbeat.ts worker/index.ts tests/integration/monitoring-heartbeat.integration.test.ts
git commit -m "feat: add worker heartbeat to redis"
```

---

### Task 2: Module kesehatan — `app/modules/monitoring/health.ts`

**Files:**
- Create: `app/modules/monitoring/health.ts`
- Test: `tests/unit/monitoring-health.test.ts`
- Test: `tests/integration/monitoring-health.integration.test.ts`

**Interfaces:**
- Consumes: `getDb` (`~/lib/db/client`), `getRedisConnection` (`~/lib/queue/connection`), `QUEUE_NAMES` (`~/lib/queue/names`), `HEARTBEAT_KEY` (Task 1).
- Produces:
  - `export type HealthStatus = "ok" | "degraded" | "down"`
  - `export type WorkerHeartbeat = { running: boolean; lastSeenAt: string | null; ageSeconds: number | null }`
  - `export type QueueCounts = { waiting: number; active: number; delayed: number; failed: number; completed: number }`
  - `export type FailedJobSummary = { id: string; name: string; attemptsMade: number; timestamp: number; finishedOn: number | null }`
  - `export type QueueSnapshot = { name: string; counts: QueueCounts; recentFailed: FailedJobSummary[] }`
  - `export type ReadinessReport = { status: HealthStatus; checks: { db: { ok: boolean }; redis: { ok: boolean }; worker: WorkerHeartbeat }; queues: QueueSnapshot[]; checkedAt: string }`
  - `export function classifyHealthStatus(dbOk: boolean, redisOk: boolean, workerRunning: boolean, hasFailedJobs: boolean): HealthStatus` — murni.
  - `export async function checkReadiness(): Promise<ReadinessReport>`

- [ ] **Step 1: Tulis test unit gagal dulu**

`tests/unit/monitoring-health.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyHealthStatus } from "~/modules/monitoring/health";

describe("classifyHealthStatus", () => {
  it("is down when db or redis fails", () => {
    expect(classifyHealthStatus(false, true, true, false)).toBe("down");
    expect(classifyHealthStatus(true, false, true, false)).toBe("down");
  });

  it("is degraded when the worker is stale or failed jobs exist", () => {
    expect(classifyHealthStatus(true, true, false, false)).toBe("degraded");
    expect(classifyHealthStatus(true, true, true, true)).toBe("degraded");
  });

  it("is ok otherwise", () => {
    expect(classifyHealthStatus(true, true, true, false)).toBe("ok");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project unit tests/unit/monitoring-health.test.ts`
Expected: FAIL — module tidak ada.

- [ ] **Step 3: Buat `app/modules/monitoring/health.ts`**

```ts
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

async function readWorkerHeartbeat(): Promise<WorkerHeartbeat> {
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
async function getQueueSnapshots(): Promise<QueueSnapshot[]> {
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
    queues.some((queue) => queue.counts.failed > 0),
  );
  return {
    status,
    checks: { db: { ok: dbOk }, redis: { ok: redisOk }, worker },
    queues,
    checkedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Jalankan test unit, pastikan pass**

Run: `npx vitest run --project unit tests/unit/monitoring-health.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Tulis test integration gagal dulu (lanjutan Task 2)**

`tests/integration/monitoring-health.integration.test.ts`:

```ts
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
```

- [ ] **Step 6: Jalankan test integration, pastikan pass**

Run: `npx vitest run --project integration tests/integration/monitoring-health.integration.test.ts`
Expected: PASS (4 tests). Catatan: status bisa `degraded` bila failed jobs sisa dari test queue lain — assertion sudah toleran.

- [ ] **Step 7: Commit**

```bash
git add app/modules/monitoring/health.ts tests/unit/monitoring-health.test.ts tests/integration/monitoring-health.integration.test.ts
git commit -m "feat: add readiness checks for db, redis, worker, and queues"
```

---

### Task 3: Route `/healthz/ready` + daftar route

**Files:**
- Create: `app/routes/healthz.ready.ts`
- Modify: `app/routes.ts:6`
- Test: `tests/integration/monitoring-health.integration.test.ts` (tambah case loader)

**Interfaces:**
- Consumes: `checkReadiness` (Task 2).
- Produces: route `healthz/ready` — loader JSON; status `503` bila `report.status === "down"`, `200` selebihnya.

- [ ] **Step 1: Tulis test gagal dulu**

Tambahkan ke `tests/integration/monitoring-health.integration.test.ts` (import loader):

```ts
import { loader as readinessLoader } from "~/routes/healthz.ready";
```

Tambahkan describe:

```ts
describe("healthz/ready loader", () => {
  it("returns a JSON report whose status matches the HTTP status", async () => {
    const response = await readinessLoader({} as never);
    const body = (await response.json()) as { status: string };
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.status).toBe(body.status === "down" ? 503 : 200);
    expect(["ok", "degraded", "down"]).toContain(body.status);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project integration tests/integration/monitoring-health.integration.test.ts`
Expected: FAIL — `~/routes/healthz.ready` tidak ada.

- [ ] **Step 3: Buat `app/routes/healthz.ready.ts`**

```ts
import { checkReadiness } from "~/modules/monitoring/health";

/**
 * Readiness endpoint: deep-checks PostgreSQL, Redis, worker heartbeat, and
 * queue health. Returns 503 when the app cannot serve (db/redis down) and
 * 200 otherwise, so orchestration can route on it.
 */
export async function loader() {
  const report = await checkReadiness();
  return Response.json(report, {
    status: report.status === "down" ? 503 : 200,
  });
}
```

- [ ] **Step 4: Daftarkan route — `app/routes.ts`**

Baris 6 menjadi:

```ts
  route("healthz", "routes/healthz.ts"),
  route("healthz/ready", "routes/healthz.ready.ts"),
```

- [ ] **Step 5: Jalankan test, pastikan pass + verifikasi**

Run: `npx vitest run --project integration tests/integration/monitoring-health.integration.test.ts`
Expected: PASS (5 tests).

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routes/healthz.ready.ts app/routes.ts tests/integration/monitoring-health.integration.test.ts
git commit -m "feat: add readiness endpoint healthz/ready"
```

---

### Task 4: Docker worker healthcheck + env + dokumentasi

**Files:**
- Modify: `docker-compose.yml` (service `worker`, setelah `volumes` baris 91)
- Modify: `.env.example` (blok Redis, setelah baris 8)
- Create: `docs/operations/monitoring.md`

**Interfaces:**
- Consumes: `HEARTBEAT_KEY` = `sakustudi:worker:heartbeat` (Task 1), env names.

- [ ] **Step 1: `docker-compose.yml` — healthcheck worker**

Di service `worker`, setelah blok `volumes` (baris 90-91), tambahkan:

```yaml
    healthcheck:
      test:
        - "CMD"
        - "node"
        - "-e"
        - "const R=require('ioredis');const r=new R(process.env.REDIS_URL||'redis://localhost:6379',{maxRetriesPerRequest:1,lazyConnect:true,connectionTimeout:5000});r.ping().then(()=>r.get('sakustudi:worker:heartbeat')).then(v=>{if(!v)throw new Error('no heartbeat');process.exit(0)}).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
```

- [ ] **Step 2: `.env.example`**

Setelah baris `REDIS_URL=redis://localhost:6379`, tambahkan:

```env
# Worker heartbeat (monitoring via /healthz/ready)
WORKER_HEARTBEAT_INTERVAL_MS=30000
WORKER_HEARTBEAT_TTL_S=90
```

- [ ] **Step 3: Buat `docs/operations/monitoring.md`**

```markdown
# Monitoring

Monitoring self-contained tanpa infra eksternal: endpoint health + worker
heartbeat di Redis.

## Endpoint

| Endpoint | Fungsi | Status |
| --- | --- | --- |
| `GET /healthz` | Liveness: proses web hidup | selalu 200 |
| `GET /healthz/ready` | Readiness: DB, Redis, worker, queue | 503 bila DB/Redis down, 200 selebihnya |

Contoh:

```bash
curl -s localhost:3000/healthz/ready | jq
```

Format `/healthz/ready`:

- `status`: `ok` | `degraded` | `down`
- `checks.db.ok` — `SELECT 1` ke PostgreSQL
- `checks.redis.ok` — `PING` Redis
- `checks.worker` — `running`, `lastSeenAt`, `ageSeconds` (heartbeat
  `sakustudi:worker:heartbeat`, TTL 90s default, ditulis tiap 30s)
- `queues[]` — per queue (`reminders`, `emails`, `exports`, `cleanup`):
  counts (`waiting/active/delayed/failed/completed`) + 5 failed jobs
  terakhir. Metadata saja: id, nama, attempts, timestamp — tanpa payload
  atau pesan error (privasi).

## Cara baca

- `down` → aplikasi tidak dapat melayani; cek PostgreSQL/Redis.
- `degraded` + `worker.running: false` → worker mati/stale; cek log worker
  (`worker: fatal boot error`, `worker: job failed`).
- `degraded` + `counts.failed > 0` → ada job gagal; cek log worker untuk
  queue/job id terkait.
- `ok` → semua sehat.

## Alert

Tanpa webhook bawaan (YAGNI). Gunakan uptime checker eksternal yang
memantau `GET /healthz/ready` dan alert saat non-200, atau cron yang
menjalankan `curl` + notifikasi sendiri.

## Konfigurasi

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `WORKER_HEARTBEAT_INTERVAL_MS` | 30000 | Interval tulis heartbeat |
| `WORKER_HEARTBEAT_TTL_S` | 90 | TTL key heartbeat (stale setelah ini) |

Worker container di docker-compose punya healthcheck: Redis `PING` + key
heartbeat harus ada; container `unhealthy` saat worker mati, restart policy
`unless-stopped` yang menangani pemulihan.
```

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: PASS semua.

Opsional (butuh Docker build, lambat): `docker compose config` — pastikan
YAML healthcheck valid.

```bash
git add docker-compose.yml .env.example docs/operations/monitoring.md
git commit -m "docs: add worker healthcheck, heartbeat env, and monitoring guide"
```

---

## Self-Review Checklist

- [ ] Spec coverage: heartbeat (Task 1), health module + status classification (Task 2), route + daftar (Task 3), compose/env/docs (Task 4).
- [ ] Tanpa placeholder: semua kode lengkap.
- [ ] Type consistency: `checkReadiness()` satu definisi dipakai Task 2 + 3; `HEARTBEAT_KEY` satu sumber (Task 1) dipakai Task 2 + compose (literal string di YAML — dicek manual).
- [ ] Privasi: `FailedJobSummary` tanpa payload/failedReason; test integration assert `not.toHaveProperty("payload"/"failedReason")`.
- [ ] Shared Redis connection tidak di-quit (hanya `close()` queue); heartbeat `stop()` idempotent.
- [ ] `/healthz` tidak berubah; route baru didaftarkan di `routes.ts`.
- [ ] Tidak ada dependency baru.
