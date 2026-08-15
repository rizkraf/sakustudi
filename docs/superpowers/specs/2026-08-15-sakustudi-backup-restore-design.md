# Sakustudi Backup & Restore Teruji Design (Fase A3c)

Status: Approved for implementation planning
Date: 2026-08-15
Source: PRD DoD "Backup dan prosedur pemulihan telah diuji"; Fase A roadmap

## Summary

Script backup/restore shell yang teruji lewat integration test drill:
`pg_dump` logical → gzip dengan retensi, restore idempotent ke environment
fresh, dan drill otomatis yang membuktikan dump → restore round-trip
berhasil. Scheduling tetap host cron (dokumen yang sudah ada diperbarui).

## Goals

- Backup SQL (sumber kebenaran) + storage volume dengan satu script.
- Restore yang terurut dan dapat diverifikasi.
- Drill restore otomatis (integration test) — bukan hanya dokumentasi.
- Retensi backup, pembersihan partial file saat gagal, exit code benar.
- Tanpa dependency baru, tanpa image tambahan (pakai binary di container
  postgres yang sudah ada).

## Non-Goals

- Cron dalam container, PITR/WAL archiving, enkripsi backup, backup
  otomatis S3, UI restore, restore point-in-time.

## Komponen

### 1. `scripts/backup.sh`

Env:
- `BACKUP_DIR` (default `./backups`)
- `BACKUP_RETENTION_DAYS` (default 7)
- `BACKUP_STORAGE_DIR` (opsional — jika diset, direktori di-tar+gzip)
- `PGDUMP_CMD` (default `docker compose exec -T postgres pg_dump -U sakustudi sakustudi`; dev: override `-f docker-compose.dev.yml`)

Flow:
1. `mkdir -p "$BACKUP_DIR"`
2. `$PGDUMP_CMD | gzip > "$BACKUP_DIR/sakustudi-$(ts).sql.gz"`
3. Verifikasi: `gzip -t` file — gagal → hapus partial + exit 1
4. Retensi: hapus `sakustudi-*.sql.gz` lebih tua dari `BACKUP_RETENTION_DAYS`
5. Jika `BACKUP_STORAGE_DIR` diset: `tar -czf storage-<ts>.tar.gz -C <parent> <dir>` + verifikasi `tar -tzf`, ikut retensi
6. Output ringkas: file yang dibuat + total; exit 0

### 2. `scripts/restore.sh`

Env: `DUMP_FILE` (wajib), `PSQL_CMD` (default `docker compose exec -T postgres psql -U sakustudi sakustudi`), `MIGRATE_CMD` (default `docker compose --profile tools run --rm migrate`).

Flow (environment fresh):
1. `--dry-run` → cetak langkah, exit 0
2. Pastikan `DUMP_FILE` ada + `gzip -t` valid
3. `gunzip -c "$DUMP_FILE" | $PSQL_CMD`
4. `$MIGRATE_CMD` (idempotent)
5. Verifikasi ringan: query `SELECT count(*) FROM user` via `$PSQL_CMD -c` — non-zero

### 3. Drill otomatis — `tests/integration/backup-restore.integration.test.ts`

- `describe.runIf(postgresContainerAvailable)` — skip jika postgres container (docker compose dev) tidak tersedia.
- Langkah:
  1. Seed data nyata (user + note via service yang ada)
  2. `docker compose -f docker-compose.dev.yml exec -T postgres pg_dump -U sakustudi sakustudi` → file `.tmp/backup-drill.sql.gz`
  3. `gzip -t` verifikasi
  4. `CREATE DATABASE sakustudi_restore_test` via psql container
  5. `gunzip -c | psql` ke DB baru
  6. Pool baru ke DB restore → assert: user + note count > 0 dan data sample match
  7. Cleanup: drop DB, hapus file, close pool
- Nama DB unik per run (`sakustudi_restore_test_<random>`), idempotent cleanup.

### 4. Dokumen `docs/operations/backup-restore.md`

- Perbarui: gunakan `scripts/backup.sh` + `scripts/restore.sh`, contoh cron host,
  mode dev (`-f docker-compose.dev.yml`), retensi, dan bagian drill test
  (jalankan `npx vitest run --project integration tests/integration/backup-restore.integration.test.ts`).

## Testing

- Integration: drill round-trip (di atas).
- Shell: verifikasi manual langkah (script dijalankan di implementasi,
  `bash -n` syntax check, dry-run restore).
- Unit: tidak ada logika TS baru selain test file.

## Out of Scope

Lihat Non-Goals.
