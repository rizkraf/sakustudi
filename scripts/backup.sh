#!/usr/bin/env bash
# Logical backup: PostgreSQL dump (gzip) with retention, optional storage tar.
# Usage: BACKUP_DIR=./backups bash scripts/backup.sh
# Dev mode: PGDUMP_CMD="docker compose -f docker-compose.dev.yml exec -T postgres pg_dump -U sakustudi sakustudi"
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
PGDUMP_CMD="${PGDUMP_CMD:-docker compose exec -T postgres pg_dump -U sakustudi sakustudi}"
TS="$(date +%Y%m%d-%H%M%S)"
SQL_FILE="$BACKUP_DIR/sakustudi-$TS.sql.gz"
STORAGE_FILE=""
CLEANUP_FILES=("$SQL_FILE")

trap 'for f in "${CLEANUP_FILES[@]}"; do rm -f "$f"; done' ERR

mkdir -p "$BACKUP_DIR"

echo "backup: dumping database -> $SQL_FILE"
# shellcheck disable=SC2086
$PGDUMP_CMD | gzip > "$SQL_FILE"
gzip -t "$SQL_FILE"

if [ -n "${BACKUP_STORAGE_DIR:-}" ]; then
  STORAGE_FILE="$BACKUP_DIR/storage-$TS.tar.gz"
  CLEANUP_FILES+=("$STORAGE_FILE")
  echo "backup: archiving storage -> $STORAGE_FILE"
  tar -czf "$STORAGE_FILE" -C "$(dirname "$BACKUP_STORAGE_DIR")" "$(basename "$BACKUP_STORAGE_DIR")"
  tar -tzf "$STORAGE_FILE" > /dev/null
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'sakustudi-*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'storage-*.tar.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete

echo "backup: done"
ls -lh "$BACKUP_DIR"
