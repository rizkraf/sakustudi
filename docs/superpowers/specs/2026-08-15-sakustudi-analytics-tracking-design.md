# Sakustudi Analytics Event Tracking Design

Status: Approved for implementation planning
Date: 2026-08-15
Source: `prd-sakustudi.md` section 15; `2026-08-14-sakustudi-mvp-core-design.md`

## Summary

Fase A2: catat event produk anonim untuk mengukur funnel pilot
(signup → onboarding → mata kuliah → aktivitas → kembali). Event ditulis
server-side dari domain service setelah mutasi sukses, disimpan di tabel
`analytics_events` yang sudah ada (dorman sejak migration 0000), dan
dibaca melalui script CLI funnel. Tidak ada UI admin, tidak ada tracking
page view, tidak ada cookie visitor, dan tidak ada PII.

## Goals

- Mencatat 10 event produk anonim yang sudah didefinisikan PRD §15 dan
  relevan dengan fitur yang sudah ada.
- Menyediakan script `npm run analytics:funnel` untuk melaporkan konversi
  funnel dan retention kasar selama pilot.
- Penulisan event tidak pernah mengubah hasil request (best-effort).
- Mendokumentasikan daftar event dan query contoh di
  `docs/operations/analytics.md`.

## Non-Goals

- Tracking page view landing/login (butuh cookie visitor atau JS; YAGNI
  untuk pilot 20 user).
- Dashboard admin analytics (masuk Fase D).
- Event AI/paywall/subscription (fitur belum ada).
- Cookie visitor ID dan identitas anonim → user.
- Penyimpanan analytics terpisah (ClickHouse, tool eksternal).

## Data Model

Tabel `analytics_events` (sudah ada, `app/lib/db/schema/app.ts:551`):

- `id` text PK
- `user_id` text nullable, FK `user.id` `ON DELETE SET NULL`
- `event_name` text not null
- `properties` jsonb not null default `{}`
- `occurred_at` timestamp with timezone not null default now

Tidak ada migration baru. Akun dihapus → `user_id` menjadi null, event
tetap ada sebagai metrik anonim.

## Architecture

Module baru `app/modules/analytics/`:

- `analytics.repository.ts` — `insertAnalyticsEvent(userId, eventName,
  properties)`; insert tunggal via `getDb()`.
- `analytics.service.ts` — `trackEvent(userId, eventName, properties)`:
  try/catch di sekeliling insert; gagal → `console.warn` tanpa melempar
  error. EventName divalidasi terhadap daftar yang dikenal sebelum insert.
- `analytics.events.ts` — konstanta nama event + tipe properties per
  event (source: catalog/custom, type aktivitas, channel reminder,
  mimeType, exportType).

Data flow:

```
mutation sukses (route action / domain service)
  → trackEvent(...)  [best-effort]
  → INSERT analytics_events
  → insert gagal → warn + request tetap sukses
```

Insert selalu **di luar** transaction domain dan tidak pernah melewati
outbox/BullMQ. Analitik adalah metrik, bukan job yang wajib dikirim.

## Events

| Event | Call site | Properties |
| --- | --- | --- |
| `signup_completed` | `register.tsx` action, setelah `recordRequiredConsents` | `{}` |
| `onboarding_started` | action pertama onboarding (pilih program) di `onboarding.tsx` | `{}` |
| `onboarding_completed` | `completeOnboarding` (`onboarding.service.ts:34`) | `{}` |
| `course_created` | courses service `createCourse` | `{ source: "catalog" \| "custom" }` |
| `activity_created` | activities service `createActivity` | `{ type: activityType }` |
| `activity_completed` | activities service, transisi status ke `completed` | `{ type: activityType }` |
| `note_created` | notes service `createNote` | `{}` |
| `file_uploaded` | files service, setelah upload valid | `{ mimeType: string \| null }` |
| `reminder_created` | reminders service, setelah jadwal tersimpan | `{ channel: reminderChannel }` |
| `export_requested` | exports service | `{ exportType: exportType }` |

Larangan properties: email, isi catatan, judul, nama mata kuliah, path
file, token, alamat IP. Event anonim bertingkat produk, bukan konten.

Event `signup_completed` dan `onboarding_started` di-emit dari route
action (bukan loader) karena loader tidak boleh menulis.

## Privacy

- Tanpa opt-in: semua user dicatat, tanpa PII.
- Privacy policy (`app/routes/legal.privacy.tsx` + `docs/legal/privacy.md`)
  ditambah kalimat: metrik produk anonim (tipe aktivitas, sumber mata
  kuliah, jenis export) dicatat untuk pengembangan; tidak berisi email,
  isi catatan, atau data file.
- Export data pengguna tidak menyertakan `analytics_events`.
- Penghapusan akun memakai perilaku FK yang sudah ada (`SET NULL`).

## Reporting

Script `scripts/analytics-funnel.ts`, dijalankan dengan
`npm run analytics:funnel`. Membaca `DATABASE_URL` seperti script lain.

Output per hari (tanggal `occurred_at` di timezone `Asia/Jakarta`):

```
Funnel 2026-08-15
signup_completed        42
onboarding_started      38
onboarding_completed    35
course_created          33
activity_created        30
returned_next_day       24
returned_within_7d      28
```

Definisi:

- `returned_next_day`: user yang punya event apa pun pada hari kalender
  setelah hari signup-nya.
- `returned_within_7d`: user yang punya event apa pun dalam 7 hari
  setelah hari signup-nya.
- Baris hanya tampil jika total > 0. Tanggal default hari ini, boleh
  lewat argumen `YYYY-MM-DD`.

Query memakai SQL agregasi; tidak ada tooling analytics eksternal.

## Documentation

`docs/operations/analytics.md` berisi: daftar event, cara menjalankan
funnel script, query SQL contoh untuk breakdown per properti (misal
`source` course, `type` aktivitas), dan catatan privasi.

## Testing

- Unit (`tests/unit/analytics-events.test.ts`):
  - `trackEvent` menolak eventName yang tidak dikenal.
  - Properties per event tidak boleh mengandung key PII (deny list:
    email, content, title, name, url, path).
- Integration (`tests/integration/analytics.integration.test.ts`):
  - `trackEvent` menyimpan baris dengan user_id dan occurred_at.
  - Insert gagal (misal mock repository throw) tidak melempar ke
    pemanggil dan mutasi tetap berhasil.
  - Hapus user → `analytics_events.user_id` menjadi null.
- Script funnel diuji lewat integration test yang menjalankan query
  inti (count per event per hari) terhadap data fixture.

## Out of Scope

- UI admin, real-time dashboard, export analytics.
- Tracking anonim sebelum login (landing view, visitor cookie).
- Retensi/archival analytics_events (keputusan ditunda).
