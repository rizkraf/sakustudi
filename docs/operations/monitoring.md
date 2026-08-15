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
