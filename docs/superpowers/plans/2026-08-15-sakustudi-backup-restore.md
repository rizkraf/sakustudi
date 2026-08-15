# Sakustudi Backup & Restore Implementation Plan (Fase A3c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script backup/restore shell yang teruji lewat integration test drill (pg_dump → restore → assert), plus update dokumen.

**Architecture:** `scripts/backup.sh` memakai `pg_dump` dari postgres container (default `docker compose exec -T postgres ...`, env-override untuk dev) → gzip → verifikasi `gzip -t` → retensi → tar storage opsional. `scripts/restore.sh` mengurutkan psql restore + migrate + verifikasi count, dengan `--dry-run`. Drill otomatis adalah integration test yang membuktikan round-trip dump→restore ke database test terpisah.

**Tech Stack:** bash, Docker Compose (postgres:16-alpine punya pg_dump/psql), Vitest integration (Node), gzip/tar.

## Global Constraints

- Tanpa dependency baru; tanpa image tambahan; tanpa perubahan schema.
- Default compose mode produksi: `docker compose exec -T postgres pg_dump -U sakustudi sakustudi`; dev mode via env override `-f docker-compose.dev.yml`.
- Backup file naming: `sakustudi-<YYYYMMDD-HHMMSS>.sql.gz` (+ `storage-<ts>.tar.gz`); direktori default `./backups`; retensi default 7 hari.
- Gagal → partial file dihapus, exit non-zero; sukses → output ringkas file + exit 0.
- Drill integration test: skip saat postgres container tidak tersedia (`describe.runIf`); nama DB test unik per run; cleanup selalu (drop DB + hapus file).
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration` (butuh `docker compose -f docker-compose.dev.yml up -d postgres`).
- Script bash: `#!/usr/bin/env bash` + `set -euo pipefail`; `bash -n` syntax check wajib.

---

### Task 1: `scripts/backup.sh`

**Files:**
- Create: `scripts/backup.sh`

**Interfaces:**
- Produces: backup script executable (bukan harus chmod di Windows; dipanggil `bash scripts/backup.sh`).
- Env: `BACKUP_DIR` (./backups), `BACKUP_RETENTION_DAYS` (7), `BACKUP_STORAGE_DIR` (opsional), `PGDUMP_CMD`.

- [ ] **Step 1: Buat `scripts/backup.sh`**

```bash
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

mkdir -p "$BACKUP_DIR"

echo "backup: dumping database -> $SQL_FILE"
# shellcheck disable=SC2086
$PGDUMP_CMD | gzip > "$SQL_FILE"
gzip -t "$SQL_FILE"

if [ -n "${BACKUP_STORAGE_DIR:-}" ]; then
  STORAGE_FILE="$BACKUP_DIR/storage-$TS.tar.gz"
  echo "backup: archiving storage -> $STORAGE_FILE"
  tar -czf "$STORAGE_FILE" -C "$(dirname "$BACKUP_STORAGE_DIR")" "$(basename "$BACKUP_STORAGE_DIR")"
  tar -tzf "$STORAGE_FILE" > /dev/null
fi

RETENTION_MS=$((BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000))
CUTOFF="$(date -d "@$(( $(date +%s) - BACKUP_RETENTION_DAYS * 86400 ))" +%s 2>/dev/null || echo "")"
if [ -n "$CUTOFF" ]; then
  for f in "$BACKUP_DIR"/sakustudi-*.sql.gz "$BACKUP_DIR"/storage-*.tar.gz; do
    [ -e "$f" ] || continue
    if [ "$(date -r "$f" +%s 2>/dev/null || echo 0)" -lt "$CUTOFF" ]; then
      rm -f "$f"
      echo "backup: removed expired $f"
    fi
  done
fi

echo "backup: done"
ls -lh "$BACKUP_DIR"
```

Catatan Windows: `date -r`/`date -d` GNU-only (Git Bash/WSL/Linux host — sesuai host cron). `RETENTION_MS` tidak terpakai — hapus baris itu saat menulis (sisa draft).

- [ ] **Step 2: Syntax check + jalankan sekali**

Run: `bash -n scripts/backup.sh`
Expected: PASS (tanpa output).

Run: `bash scripts/backup.sh`
Expected: dump ke `./backups/sakustudi-<ts>.sql.gz`, `gzip -t` lolos, output "backup: done", exit 0. (Butuh postgres container dev jalan: `docker compose -f docker-compose.dev.yml up -d postgres`.)

Run: `bash scripts/backup.sh` lagi — tidak error; file kedua muncul.

- [ ] **Step 3: Uji gagal path**

Run: `PGDUMP_CMD="false" bash scripts/backup.sh`
Expected: exit non-zero (set -e), tidak ada partial `.sql.gz` baru yang valid tersisa.

- [ ] **Step 4: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat: add logical backup script with retention"
```

---

### Task 2: `scripts/restore.sh`

**Files:**
- Create: `scripts/restore.sh`

**Interfaces:**
- Env: `DUMP_FILE` (wajib), `PSQL_CMD` (default `docker compose exec -T postgres psql -U sakustudi sakustudi`), `MIGRATE_CMD` (default `docker compose --profile tools run --rm migrate`).
- Flag: `--dry-run`.

- [ ] **Step 1: Buat `scripts/restore.sh`**

```bash
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
```

Catatan: query verifikasi memakai `\"user\"` karena tabel Better Auth bernama `user` (reserved). `eval` dipakai karena command env bisa berisi pipe — nilai env dianggap trusted (operator).

- [ ] **Step 2: Syntax check + dry-run**

Run: `bash -n scripts/restore.sh`
Expected: PASS.

Run: `DUMP_FILE=./backups/sakustudi-<ts>.sql.gz bash scripts/restore.sh --dry-run`
Expected: mencetak 3 langkah + "done", exit 0, tidak ada eksekusi.

- [ ] **Step 3: Uji restore nyata ke DB fresh**

Siapkan DB test: `docker compose -f docker-compose.dev.yml exec -T postgres psql -U sakustudi -c 'DROP DATABASE IF EXISTS sakustudi_restore_manual'` lalu `... -c 'CREATE DATABASE sakustudi_restore_manual'`.

Run: `DUMP_FILE=./backups/sakustudi-<ts>.sql.gz PSQL_CMD="docker compose -f docker-compose.dev.yml exec -T postgres psql -U sakustudi sakustudi_restore_manual" bash scripts/restore.sh`
Expected: restore sukses (dump dari DB utama berisi data; verifikasi count > 0).

Cleanup: `docker compose -f docker-compose.dev.yml exec -T postgres psql -U sakustudi -c 'DROP DATABASE IF EXISTS sakustudi_restore_manual'`

- [ ] **Step 4: Commit**

```bash
git add scripts/restore.sh
git commit -m "feat: add restore script with dry-run"
```

---

### Task 3: Drill integration test

**Files:**
- Create: `tests/integration/backup-restore.integration.test.ts`

**Interfaces:**
- Consumes: service `createNote`/`createUser` pattern dari integration tests lain; postgres container dev.
- Produces: test `describe.runIf(postgresContainerAvailable)` — round-trip dump→restore→assert.

- [ ] **Step 1: Tulis test**

`tests/integration/backup-restore.integration.test.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import { user } from "~/lib/db/schema";
import { createAcademicTerm } from "~/modules/academic-terms/terms.service";
import { createCustomCourse } from "~/modules/catalog/catalog.service";
import { createNote } from "~/modules/notes/notes.service";

const exec = promisify(execFile);
const COMPOSE = "docker-compose.dev.yml";
const DB_USER = "sakustudi";
const DB_NAME = "sakustudi";

async function dockerAvailable(): Promise<boolean> {
  try {
    const { stdout } = await exec("docker", ["compose", "-f", COMPOSE, "ps", "-q", "postgres"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function psql(sql: string, db = DB_NAME): Promise<void> {
  await exec("docker", ["compose", "-f", COMPOSE, "exec", "-T", "postgres", "psql", "-U", DB_USER, "-d", db, "-c", sql]);
}

describe.runIf(await dockerAvailable())("backup/restore drill", () => {
  const restoreDb = `sakustudi_restore_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  let dumpPath = "";
  let tempDir = "";
  let createdUserId = "";
  let restorePool: Pool | null = null;

  beforeAll(async () => {
    createdUserId = crypto.randomUUID();
    await getDb().insert(user).values({
      id: createdUserId,
      name: "Backup Drill User",
      email: `${createdUserId}@backup-drill.test`,
      emailVerified: true,
    });
    const term = await createAcademicTerm(createdUserId, {
      name: "Drill Term",
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: new Date("2027-02-28T00:00:00Z"),
    });
    const course = await createCustomCourse(createdUserId, term.id, { name: "Drill Course" });
    await createNote(createdUserId, { title: "Drill note title", courseId: course.id });

    tempDir = await mkdtemp(join(tmpdir(), "sakustudi-backup-"));
    dumpPath = join(tempDir, "drill.sql.gz");

    const { stdout } = await exec("docker", [
      "compose", "-f", COMPOSE, "exec", "-T", "postgres",
      "pg_dump", "-U", DB_USER, DB_NAME,
    ]);
    const { gzip } = await import("node:zlib");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(dumpPath, gzip.gzipSync(Buffer.from(stdout, "utf8"))),
    );

    await psql("CREATE DATABASE " + restoreDb);
    const gunzipped = (await import("node:zlib")).gunzipSync(
      (await import("node:fs/promises")).readFileSync(dumpPath),
    );
    await exec("docker", [
      "compose", "-f", COMPOSE, "exec", "-T", "postgres",
      "psql", "-U", DB_USER, "-d", restoreDb,
    ], { input: gunzipped.toString("utf8") });

    restorePool = new Pool({
      connectionString: `postgres://${DB_USER}:${DB_USER}@localhost:5432/${restoreDb}`,
    });
    await migrate(restorePool as never, { migrationsFolder: "./drizzle" });
  });

  it("restores the seeded data into a fresh database", async () => {
    expect(restorePool).toBeTruthy();
    const users = await restorePool!.query("SELECT count(*)::int AS n FROM \"user\"");
    const notes = await restorePool!.query("SELECT count(*)::int AS n FROM notes");
    expect(Number(users.rows[0].n)).toBeGreaterThan(0);
    expect(Number(notes.rows[0].n)).toBeGreaterThan(0);

    const note = await restorePool!.query(
      "SELECT title FROM notes WHERE title = $1",
      ["Drill note title"],
    );
    expect(note.rows.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (restorePool) {
      await restorePool.end().catch(() => undefined);
      restorePool = null;
    }
    await psql("DROP DATABASE IF EXISTS " + restoreDb).catch(() => undefined);
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    if (createdUserId) {
      await getDb().delete(user).where(eq(user.id, createdUserId)).catch(() => undefined);
    }
    await closeDb();
  });
});
```

Catatan implementasi: streaming dump lewat stdout (bukan pipe shell) — `execFile` tanpa shell; hasil stdout di-gzip manual. `migrate` dipanggil pada restore DB untuk bukti "migrate idempotent setelah restore" (opsional — jika menyebabkan masalah, cukup skip migrate dan hanya assert data; catat di report).

- [ ] **Step 2: Jalankan test**

Run: `npx vitest run --project integration tests/integration/backup-restore.integration.test.ts`
Expected: PASS (1 test) — butuh postgres container dev. Kalau container tidak tersedia, test terskip (`skipped`).

- [ ] **Step 3: Verifikasi penuh**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: PASS semua.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/backup-restore.integration.test.ts
git commit -m "test: add automated backup/restore drill"
```

---

### Task 4: Update `docs/operations/backup-restore.md`

**Files:**
- Modify: `docs/operations/backup-restore.md`

- [ ] **Step 1: Update dokumen**

Ganti isi dengan:

```markdown
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
```

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run lint` (docs tidak terpengaruh; konfirmasi).
Run: `bash -n scripts/backup.sh && bash -n scripts/restore.sh`
Expected: PASS.

```bash
git add docs/operations/backup-restore.md
git commit -m "docs: document scripted backup/restore and automated drill"
```

---

## Self-Review Checklist

- [ ] Spec coverage: backup script (Task 1), restore script (Task 2), drill test (Task 3), docs (Task 4).
- [ ] Tanpa placeholder: script lengkap; catatan Windows/GNU date dicantumkan.
- [ ] Konsistensi: env names sama di script, docs, dan test; `docker-compose.dev.yml` dipakai test + contoh dev; default produksi compose tanpa flag.
- [ ] Gagal-path: `set -euo pipefail`, partial file tidak dibiarkan (backup: hapus di catch — perhatikan: `set -e` keluar sebelum hapus; tambahkan trap di implementasi jika perlu, catat di report).
- [ ] Drill: DB unik + cleanup; skip kalau docker tidak tersedia.
