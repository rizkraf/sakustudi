# Backup & Restore

## Sumber kebenaran

- **PostgreSQL**: semua data aplikasi + auth.
- **Private storage** (`STORAGE_LOCAL_ROOT` volume atau bucket S3): file
  attachment dan hasil export.
- **Redis**: hanya queue/antrean job. Selalu bisa direkonstruksi dari
  PostgreSQL (outbox + reminder rows) — bukan sumber kebenaran.

## Backup terjadwal

Gunakan `scripts/backup.sh` (pg_dump logical + gzip + retensi + storage
tar opsional):

```bash
# Produksi (compose default)
bash scripts/backup.sh

# Mode dev (compose dev file)
PGDUMP_CMD="docker compose -f docker-compose.dev.yml exec -T postgres pg_dump -U sakustudi sakustudi" bash scripts/backup.sh

# Dengan backup volume storage
BACKUP_STORAGE_DIR=/var/lib/docker/volumes/sakustudi_storage-data/_data bash scripts/backup.sh
```

Variabel: `BACKUP_DIR` (default `./backups`), `BACKUP_RETENTION_DAYS`
(default 7), `BACKUP_STORAGE_DIR` (opsional), `PGDUMP_CMD`.

Contoh cron (host, produksi):

```cron
0 3 * * * cd /opt/sakustudi && bash scripts/backup.sh >> /var/log/sakustudi-backup.log 2>&1
```

Simpan backup di host/objek storage yang berbeda dari data asli.

## Restore

Gunakan `scripts/restore.sh` (urutan: restore dump → migrate → verifikasi):

```bash
# Dry-run dulu
DUMP_FILE=./backups/sakustudi-YYYYMMDD-HHMMSS.sql.gz bash scripts/restore.sh --dry-run

# Restore nyata (environment fresh: postgres sudah up, DB kosong)
DUMP_FILE=./backups/sakustudi-YYYYMMDD-HHMMSS.sql.gz bash scripts/restore.sh
```

Variabel: `DUMP_FILE` (wajib), `PSQL_CMD`, `MIGRATE_CMD` (default compose
produksi). Mode dev: override dengan `-f docker-compose.dev.yml`.

Jika backup menyertakan storage (`storage-<ts>.tar.gz` dari
`BACKUP_STORAGE_DIR`), pulihkan sebelum menyalakan aplikasi:

```bash
tar -xzf /backups/storage-YYYYMMDD-HHMMSS.tar.gz -C /data   # sesuaikan dengan STORAGE_LOCAL_ROOT/volume
```

Setelah restore: `docker compose up -d` — worker menjalankan reconciliation:
outbox pending dan reminder yang jatuh tempo di-enqueue ulang dari
PostgreSQL. Verifikasi manual: login, dashboard, catatan, file, reminder,
export, dan delete.

## Drill otomatis

Prosedur pemulihan diuji otomatis (round-trip dump → restore ke database
test terpisah → assert data):

```bash
npx vitest run --project integration tests/integration/backup-restore.integration.test.ts
```

Test terskip jika postgres container dev tidak berjalan.

## Catatan

- Redis tidak perlu di-restore; job yang hilang dipulihkan dari PostgreSQL.
- Backup SQL dan storage jangan disimpan di host yang sama dengan data asli.
