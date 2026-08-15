# Analytics

Sakustudi mencatat event produk anonim untuk mengukur funnel pilot. Data
disimpan di tabel `analytics_events` (PostgreSQL, source of truth). Tidak ada
tool eksternal dan tidak ada tracking page view.

## Privasi

- Event tidak pernah berisi email, isi catatan, judul, nama, path file,
  token, IP, atau password.
- Tidak ada opt-in: metrik anonim dicatat untuk semua user (lihat Privacy
  Policy).
- Penghapusan akun menghilangkan asosiasi user pada event (FK
  `ON DELETE SET NULL`).
- Export data pengguna tidak menyertakan analytics events.

## Daftar event

| Event | Call site | Properties |
| --- | --- | --- |
| `signup_completed` | `register.tsx` action | — |
| `onboarding_started` | `onboarding.tsx` action (step program) | — |
| `onboarding_completed` | `completeOnboarding` | — |
| `course_created` | `createCourseFromCatalog` / `createCustomCourse` | `source: catalog \| custom` |
| `activity_created` | `createActivity` | `type` |
| `activity_completed` | `setActivityStatus` | `type` |
| `note_created` | `createNote` | — |
| `file_uploaded` | `createAttachment` | `mimeType` |
| `reminder_created` | `createActivity` (saat schedule terbentuk) | `channels: in_app \| email` |
| `export_requested` | `requestDataExport` | `exportType` |

## Funnel CLI

```bash
npm run analytics:funnel            # hari ini (Asia/Jakarta)
npm run analytics:funnel 2026-08-01 # tanggal tertentu
```

Output: jumlah user per event di hari tersebut + `returned_next_day` dan
`returned_within_7d` (user yang signup hari itu lalu aktif kembali dalam
1 hari / 7 hari).

## Query contoh

Breakdown sumber mata kuliah:

```sql
select properties->>'source' as source, count(distinct user_id)
from analytics_events
where event_name = 'course_created'
  and occurred_at >= now() - interval '30 days'
group by 1;
```

Breakdown tipe aktivitas:

```sql
select properties->>'type' as type, count(distinct user_id)
from analytics_events
where event_name = 'activity_created'
  and occurred_at >= now() - interval '30 days'
group by 1;
```

Breakdown channel reminder:

```sql
select jsonb_array_elements_text(properties->'channels') as channel,
       count(distinct user_id)
from analytics_events
where event_name = 'reminder_created'
  and occurred_at >= now() - interval '30 days'
group by 1;
```
