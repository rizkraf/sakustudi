# Storage

## Local (default)

- `STORAGE_DRIVER=local`
- `STORAGE_LOCAL_ROOT=/data/files` (di compose: volume `storage-data`).
- File disimpan di luar webroot, mode `0700/0600`.
- Object key = UUID acak yang divalidasi; nama file asli hanya metadata DB.
- Back up volume ini bersama PostgreSQL (lihat backup-restore.md).

## S3-compatible (opsional)

- `STORAGE_DRIVER=s3` + `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- Bucket **harus private**. Download melewati handler terotorisasi atau
  signed URL pendek; kredensial tidak pernah dikirim ke browser.
- MinIO lokal untuk development tersedia di `docker-compose.dev.yml`
  (console :9001, root user `sakustudi` / `sakustudi-minio`).

## Keamanan

- Allowlist ekstensi: PDF, PNG, JPEG, DOCX.
- MIME header tidak dipercaya; magic bytes diverifikasi; checksum sha256
  disimpan dan diverifikasi saat download (driver lokal).
- Limit per file `MAX_UPLOAD_BYTES` dan per user `MAX_STORAGE_BYTES`
  ditegakkan di server.
- Orphan cleanup: worker menghapus object tanpa metadata DB (queue `cleanup`).
- Saat akun dihapus, object privat dihapus oleh job `delete-user-files`
  (idempotent, retry).
