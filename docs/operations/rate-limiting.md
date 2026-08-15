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
