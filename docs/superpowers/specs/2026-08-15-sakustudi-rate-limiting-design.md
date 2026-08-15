# Sakustudi Rate Limiting Design (Fase A3a)

Status: Approved for implementation planning
Date: 2026-08-15
Source: `prd-sakustudi.md` NFR (rate limiting untuk login dan upload);
prioritas Fase A3 (ops hardening)

## Summary

Rate limiting berbasis Redis untuk endpoint auth (per-IP) dan upload file
(per-user), plus limit per-email untuk login. Satu mekanisme Lua atomik
tanpa dependency baru; fail-open saat Redis bermasalah. Tidak menggunakan
rate limit built-in Better Auth (memory storage per-proses).

## Goals

- Membatasi percobaan login brute-force: per-IP pada semua halaman auth,
  per-email pada aksi login.
- Membatasi registrasi, forgot/reset password, dan endpoint `/api/auth/*`
  per-IP.
- Membatasi upload file per-user.
- 429 + `Retry-After` yang benar; kode `RATE_LIMITED` sudah ada di
  `app/lib/errors/codes.ts` dan mapping 429 di `response.ts:54`.
- Konfigurasi via environment; dapat dimatikan untuk E2E/dev.
- Tanpa dependency baru; Redis adalah infra yang sudah ada (BullMQ).

## Non-Goals

- Throttle generic per-IP untuk semua route (dashboard, healthz, dsb).
- Rate limit AI (Fase C).
- Rate limit built-in Better Auth (tidak dipakai).
- Dashboard admin, migrasi database, tracking usage.

## Architecture

```
Request masuk
  → express middleware rate-limit (server/app.ts, setelah requestIdMiddleware)
  → match path+method ke rule (rules.ts, murni)
  → consumeRateLimit(key, windowMs, limit)  [Lua atomik INCR+EXPIRE]
  → blocked → 429 + Retry-After
  → Redis error → fail-open (warn + allow)

Route action login (login.tsx)
  → assertLoginRateLimit(email)  [per-email, 5/10 menit]
  → auth.api.signInEmail

Route action upload (activities/notes)
  → assertUploadRateLimit(userId)  [60/jam]
  → createAttachment
```

`server/app.ts` memakai `virtual:react-router/server-build`, sehingga
middleware tidak bisa diuji melalui import; middleware diuji dengan
mock `req/res`, sementara core limiter dan helper diuji integration
terhadap Redis sungguhan.

## Komponen

### 1. Core limiter — `app/lib/rate-limit/rate-limiter.ts`

`consumeRateLimit(key, windowMs, limit)`:

- Lua script atomik:
  - key tidak ada: INCR + EXPIRE(windowMs) → allowed
  - count <= limit: allowed
  - count > limit: `{ allowed: false, retryAfterSeconds: <sisa TTL> }`
- Menggunakan `getRedisConnection()` (`app/lib/queue/connection.ts`).
- Fail-open: error Redis → `console.warn` + `{ allowed: true, retryAfterSeconds: 0 }`.
- Return `{ allowed: boolean; retryAfterSeconds: number }`.

### 2. Rules — `app/lib/rate-limit/rules.ts` (murni)

`matchRateLimitRule(method, pathname)` mengembalikan `{ keyPrefix, windowMs, limit } | null`:

| Method | Path | Key prefix | Default |
| --- | --- | --- | --- |
| POST | `/login` | `auth:login:ip` | 20 / 600 detik |
| POST | `/register` | `auth:register:ip` | 5 / 3600 detik |
| POST | `/forgot-password` | `auth:forgot:ip` | 5 / 3600 detik |
| POST | `/reset-password/*` | `auth:reset:ip` | 10 / 3600 detik |
| any | `/api/auth/*` | `auth:api:ip` | 60 / 600 detik |

Limit dapat di-override env (`RATE_LIMIT_<NAMA>_MAX`, `0` = default):
`LOGIN_IP`, `LOGIN_EMAIL`, `UPLOAD`, `REGISTER_IP`, `FORGOT_IP`,
`RESET_IP`, `API_IP`.

### 3. Middleware — `app/lib/rate-limit/middleware.ts`

- Signatura express `(req, res, next)`.
- `RATE_LIMIT_ENABLED === "false"` → `next()` langsung.
- `clientIp` dari `x-forwarded-for` (hop pertama) atau `req.socket.remoteAddress`.
- Key = `<prefix>:<ip>`.
- Blocked → `res.status(429).set("Retry-After", retryAfterSeconds)`;
  body JSON untuk `/api/*`, HTML minimal untuk lainnya; `console.warn`.
- Dipasang di `server/app.ts` setelah `requestIdMiddleware`.

### 4. Helper per-route — `app/lib/rate-limit/assertions.ts`

- `assertLoginRateLimit(email)` — key `auth:login:email:<lowercase>`,
  5 / 600 detik; throw `AppError("RATE_LIMITED")` saat blocked. Dipanggil
  di `app/routes/login.tsx` action sebelum `signInEmail`.
- `assertUploadRateLimit(userId)` — key `upload:user:<userId>`,
  60 / 3600 detik; dipanggil di `app/routes/activities.$activityId.tsx:108`
  dan `app/routes/notes.$noteId.tsx:119` sebelum `createAttachment`.

`AppError("RATE_LIMITED")` dirender 429 otomatis oleh
`app/lib/errors/response.ts` (mapping sudah ada).

## Environment

`RATE_LIMIT_ENABLED` (default `true`). Playwright webServer env
(`playwright.config.ts`) menambahkan `RATE_LIMIT_ENABLED: "false"`.
`.env.example` + `docs/operations/rate-limiting.md` mendokumentasikan
semua variabel.

## Testing

- Unit (`tests/unit/rate-limit.test.ts`):
  - `matchRateLimitRule`: method/path cocok, pattern `*`, null untuk route
    tak terproteksi, env override parse (`0` = default).
  - Key building: email lowercase, ip dari header.
- Integration (`tests/integration/rate-limit.integration.test.ts`, Redis
  hidup):
  - `consumeRateLimit`: allowed sampai limit, blocked setelahnya,
    `retryAfterSeconds` turun seiring waktu, key berbeda independen.
  - Fail-open: mock redis error → allowed.
  - `assertLoginRateLimit`/`assertUploadRateLimit`: blocked → throw
    AppError `RATE_LIMITED`.
- E2E: tidak ada perubahan test; `RATE_LIMIT_ENABLED=false` di webServer.

## Out of Scope

Throttle semua route, AI rate limit, admin UI, storage selain Redis,
Better Auth built-in rate limit.
