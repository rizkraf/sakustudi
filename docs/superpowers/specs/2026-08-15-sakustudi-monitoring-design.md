# Sakustudi Monitoring Design (Fase A3b)

Status: Approved for implementation planning
Date: 2026-08-15
Source: Fase A roadmap (ops hardening); PRD NFR reliability

## Summary

Readiness + worker heartbeat + queue visibility tanpa infra eksternal:
`/healthz` liveness tetap, `/healthz/ready` baru mengecek DB, Redis,
heartbeat worker, dan snapshot queue. Worker menulis heartbeat ke Redis;
docker-compose mendapatkan healthcheck worker. Alert tetap berbasis log
dan uptime checker eksternal (YAGNI: tanpa webhook/Prometheus).

## Goals

- Mendeteksi web sehat (liveness) vs siap melayani (readiness).
- Mendeteksi worker mati/stale — saat ini worker tanpa healthcheck di
  compose, kematiannya tidak terlihat sampai reminder tidak terkirim.
- Visibilitas backlog queue dan failed jobs (metadata saja, tanpa
  payload/error message — privasi).
- Self-contained: tanpa dependency baru, tanpa infra tambahan.
- Worker container unhealthy → restart policy Docker bekerja.

## Non-Goals

- Prometheus metrics, webhook alert, dashboard UI.
- Autentikasi endpoint health (public).
- Riwayat metrik historis; data heartbeat hanya snapshot terakhir.

## Architecture

```
Worker process
  → startHeartbeat(): tiap 30s SET sakustudi:worker:heartbeat <ISO> EX 90
  → shutdown: hapus key

Web /healthz          → { status: "ok" }              (liveness, cepat)
Web /healthz/ready    → checkReadiness()              (readiness)
  ├─ checkDb()          SELECT 1 via pool
  ├─ checkRedis()       PING shared connection
  ├─ readWorkerHeartbeat()  GET key → { running, lastSeenAt, ageSeconds }
  └─ getQueueSnapshots()    per queue: getJobCounts() + 5 failed jobs
                            { id, name, attemptsMade, timestamp, finishedOn }
  → status: down (503) jika db/redis gagal;
    degraded (200) jika worker stale / ada failed jobs
```

## Komponen

### 1. Heartbeat worker — `worker/index.ts`

- `startHeartbeat(intervalMs, ttlSeconds)` — `setInterval`:
  `SET sakustudi:worker:heartbeat <ISO timestamp> EX <ttl>`.
- Default: interval 30.000ms, TTL 90s; env override
  `WORKER_HEARTBEAT_INTERVAL_MS`, `WORKER_HEARTBEAT_TTL_S`.
- Shutdown: `clearInterval` + `DEL` key (idempotent).
- Key Redis dibagi dengan BullMQ (`getRedisConnection`), murah (SETEX).

### 2. Module `app/modules/monitoring/health.ts`

- `checkDb(): Promise<boolean>` — `SELECT 1` via `getDb()`, catch → false.
- `checkRedis(): Promise<boolean>` — `ping()` via `getRedisConnection()`,
  catch → false.
- `readWorkerHeartbeat(): Promise<WorkerHeartbeat>` — `GET` key;
  `{ running: boolean; lastSeenAt: string | null; ageSeconds: number | null }`;
  `running` = nilai ada dan age ≤ TTL.
- `getQueueSnapshots(): Promise<QueueSnapshot[]>` — untuk setiap nama di
  `QUEUE_NAMES`: buka `new Queue(name, { connection })`, `getJobCounts()`,
  `getJobs("failed", 0, 5)` dipetakan ke `{ id, name, attemptsMade,
  timestamp, finishedOn }`, tutup queue (shared connection tidak di-quit).
- `checkReadiness(): Promise<ReadinessReport>` —
  `{ status, checks, queues, checkedAt }`; `status`: `"down"` bila db atau
  redis gagal, `"degraded"` bila worker stale atau ada failed jobs,
  `"ok"` selebihnya.

Types diekspor: `WorkerHeartbeat`, `QueueSnapshot`, `ReadinessReport`,
`HealthStatus = "ok" | "degraded" | "down"`.

### 3. Route `/healthz/ready`

- File `app/routes/healthz.ready.ts`, didaftarkan di `app/routes.ts`.
- Loader: `checkReadiness()` → `Response.json(report, { status:
  report.status === "down" ? 503 : 200 })`.
- `/healthz` tidak berubah (liveness, dipakai web healthcheck compose).

### 4. Docker compose

- Service `worker`: healthcheck inline `node -e` — connect Redis
  (`REDIS_URL`, `maxRetriesPerRequest: 1`, `connectionTimeout: 5000`,
  `lazyConnect`), `ping()`, `get('sakustudi:worker:heartbeat')`, exit 0
  hanya jika ping ok dan key ada. `interval: 30s`, `timeout: 10s`,
  `retries: 3`, `start_period: 20s`. ioredis adalah dependency produksi,
  tersedia di image.
- Service `web`: healthcheck tidak berubah.

### 5. Env & docs

- `.env.example`: `WORKER_HEARTBEAT_INTERVAL_MS=30000`,
  `WORKER_HEARTBEAT_TTL_S=90`.
- `docs/operations/monitoring.md`: endpoint, format laporan, cara baca
  status, cara alert (uptime checker eksternal ke `/healthz/ready`),
  contoh `curl`.

## Testing

- Unit (`tests/unit/monitoring-health.test.ts`):
  - helper murni (jika diekstrak): klasifikasi status, format snapshot.
- Integration (`tests/integration/monitoring.integration.test.ts`, Redis +
  PostgreSQL hidup):
  - heartbeat write → `readWorkerHeartbeat` running, age kecil;
  - key dihapus → `running: false`;
  - `checkReadiness` dengan infra hidup → status `"ok"` (atau degraded
    karena failed jobs sisa — gunakan key unik/fixture terkontrol);
  - `getQueueSnapshots` → 4 queue dengan counts + array failed jobs
    (metadata only).
  - Route loader `/healthz/ready` → 200/503 sesuai state (via
    `loader` dengan Redis/DB nyata).
- E2E: tidak berubah; heartbeat interval default tidak mengganggu.

## Out of Scope

Prometheus, webhook alert, dashboard, auth endpoint, riwayat metrik,
alerting di dalam aplikasi.
