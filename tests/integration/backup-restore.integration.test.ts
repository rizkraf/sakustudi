import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";

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

async function psqlRestore(db: string, sql: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "-f", COMPOSE, "exec", "-T", "postgres", "psql", "-U", DB_USER, "-d", db],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdin.write(sql);
    child.stdin.end();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql restore of ${db} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

describe.runIf(await dockerAvailable())("backup/restore drill", () => {
  const restoreDb = `sakustudi_restore_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
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
    const { gzipSync } = await import("node:zlib");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(dumpPath, gzipSync(Buffer.from(stdout, "utf8"))),
    );

    await psql("CREATE DATABASE " + restoreDb);
    const gunzipped = (await import("node:zlib")).gunzipSync(
      await (await import("node:fs/promises")).readFile(dumpPath),
    );
    await psqlRestore(restoreDb, gunzipped.toString("utf8"));

    restorePool = new Pool({
      connectionString: `postgres://${DB_USER}:${DB_USER}@localhost:5432/${restoreDb}`,
    });
    await migrate(drizzle(restorePool), { migrationsFolder: "./drizzle" });
  }, 120_000);

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
