# Backup & Restore

## Sumber kebenaran

- **PostgreSQL**: semua data aplikasi + auth.
- **Private storage** (`STORAGE_LOCAL_ROOT` volume atau bucket S3): file
  attachment dan hasil export.
- **Redis**: hanya queue/antrean job. Selalu bisa direkonstruksi dari
  PostgreSQL (outbox + reminder rows) — bukan sumber kebenaran.

## Backup terjadwal

Contoh cron (host) untuk compose default:

```cron
# PostgreSQL logical dump, retensi 7 hari
0 3 * * * docker compose exec -T postgres pg_dump -U sakustudi sakustudi | gzip > /backups/sakustudi-$(date +\%F).sql.gz && find /backups -name '*.sql.gz' -mtime +7 -delete

# Volume storage (rsync ke lokasi lain)
30 3 * * * rsync -a --delete /var/lib/docker/volumes/sakustudi_storage-data/ /backups/storage/
```

## Restore

Urutan (di environment fresh):

1. `docker compose up -d postgres redis` (sebelum web/worker).
2. Restore dump:

   ```bash
   gunzip -c /backups/sakustudi-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U sakustudi sakustudi
   ```

3. Restore volume storage dari backup.
4. Jalankan migrate (idempotent, menyelaraskan schema):

   ```bash
   docker compose --profile tools run --rm migrate
   ```

5. `docker compose up -d` — worker menjalankan reconciliation: outbox pending
   dan reminder yang jatuh tempo di-enqueue ulang dari PostgreSQL.
6. Verifikasi: login, dashboard, catatan, file, reminder, export, dan delete.

## Catatan

- Redis tidak perlu di-restore; job yang hilang dipulihkan dari PostgreSQL.
- Uji drill restore di environment terpisah minimal sekali sebelum go-live.
- Backup SQL dan storage jangan disimpan di host yang sama dengan data asli.
