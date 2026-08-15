#!/usr/bin/env bash
# Restore a logical backup into a fresh environment.
# Usage: DUMP_FILE=./backups/sakustudi-20260815-120000.sql.gz bash scripts/restore.sh [--dry-run]
set -euo pipefail

DUMP_FILE="${DUMP_FILE:-}"
PSQL_CMD="${PSQL_CMD:-docker compose exec -T postgres psql -U sakustudi sakustudi}"
MIGRATE_CMD="${MIGRATE_CMD:-docker compose --profile tools run --rm migrate}"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

if [ -z "$DUMP_FILE" ]; then
  echo "restore: DUMP_FILE is required" >&2
  exit 1
fi

step() {
  echo "restore: $1"
  if [ "$DRY_RUN" = false ]; then
    eval "$2"
  fi
}

echo "restore: target dump $DUMP_FILE (dry-run: $DRY_RUN)"
if [ "$DRY_RUN" = false ]; then
  gzip -t "$DUMP_FILE"
fi

step "1. restore dump into database" "gunzip -c '$DUMP_FILE' | $PSQL_CMD"
step "2. apply migrations (idempotent)" "$MIGRATE_CMD"
step "3. verify row count" "$PSQL_CMD -tAc 'SELECT count(*) FROM \"user\"' | grep -q '[1-9]'"

echo "restore: done"
