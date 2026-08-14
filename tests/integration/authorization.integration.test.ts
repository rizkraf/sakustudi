import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import {
  attachments,
  courses,
  notes,
  user,
} from "~/lib/db/schema";
import { AppError } from "~/lib/errors/AppError";
import { requireOwnedUser } from "~/lib/authorization/ownership.server";
import {
  deleteOwnedNote,
  findOwnedAttachmentForDownload,
  findOwnedNote,
  updateOwnedNote,
} from "~/modules/shared/repository";

const db = getDb();
const createdUserIds: string[] = [];

function newUserId(): string {
  const id = crypto.randomUUID();
  createdUserIds.push(id);
  return id;
}

async function createUser(id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: "Authorization Test User",
    email: `${id}@authz.integration.test`,
    emailVerified: true,
  });
}

async function createFixtures(ownerId: string) {
  const [course] = await db
    .insert(courses)
    .values({ userId: ownerId, name: "Database Systems", code: "SISI4101" })
    .returning();
  const [note] = await db
    .insert(notes)
    .values({ userId: ownerId, courseId: course.id, title: "Secret Note" })
    .returning();
  const [attachment] = await db
    .insert(attachments)
    .values({
      userId: ownerId,
      filename: "secret.pdf",
      storageKey: `users/${ownerId}/secret.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 2048,
      courseId: course.id,
    })
    .returning();
  return { course, note, attachment };
}

describe("repository ownership boundaries", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  }, 60_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }
    await closeDb();
  });

  it("User B cannot read User A's note", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await createUser(userA);
    await createUser(userB);
    const { note } = await createFixtures(userA);

    expect(await findOwnedNote(userB, note.id)).toBeUndefined();
    expect(await findOwnedNote(userA, note.id)).toMatchObject({
      id: note.id,
      title: "Secret Note",
    });
  });

  it("User B cannot update User A's note", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await createUser(userA);
    await createUser(userB);
    const { note } = await createFixtures(userA);

    const attempt = await updateOwnedNote(userB, note.id, {
      title: "HACKED",
      content: "pwned",
    });
    expect(attempt).toBeUndefined();

    const after = await findOwnedNote(userA, note.id);
    expect(after).toMatchObject({ title: "Secret Note" });
    expect(after?.content).toBeNull();

    const legit = await updateOwnedNote(userA, note.id, { title: "Renamed" });
    expect(legit).toMatchObject({ id: note.id, title: "Renamed" });
  });

  it("User B cannot delete User A's note", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await createUser(userA);
    await createUser(userB);
    const { note } = await createFixtures(userA);

    expect(await deleteOwnedNote(userB, note.id)).toBe(false);
    expect(await findOwnedNote(userA, note.id)).toBeDefined();

    expect(await deleteOwnedNote(userA, note.id)).toBe(true);
    expect(await findOwnedNote(userA, note.id)).toBeUndefined();
  });

  it("User B cannot download User A's attachment", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await createUser(userA);
    await createUser(userB);
    const { attachment } = await createFixtures(userA);

    expect(await findOwnedAttachmentForDownload(userB, attachment.id)).toBeUndefined();

    expect(await findOwnedAttachmentForDownload(userA, attachment.id)).toEqual({
      storageKey: `users/${userA}/secret.pdf`,
      filename: "secret.pdf",
      mimeType: "application/pdf",
    });
  });

  it("requireOwnedUser guards cross-user rows with a generic NOT_FOUND", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await createUser(userA);
    await createUser(userB);
    const { note } = await createFixtures(userA);

    expect(() => requireOwnedUser(userA, note)).not.toThrow();
    expect(() => requireOwnedUser(userB, note)).toThrow(AppError);
    expect(() => requireOwnedUser(userB, note)).toThrowError("Not found.");
    expect(() => requireOwnedUser(userB, null)).toThrow(AppError);

    try {
      requireOwnedUser(userB, note);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe("NOT_FOUND");
    }
  });

  describe("production CSRF secret guard", () => {
    const BOOT_SCRIPT =
      "import('./app/lib/request/security.server.ts').then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? String(e)); process.exit(1); })";

    function bootSecurityInProduction(
      csrfSecret: string | undefined,
      betterAuthSecret: string | undefined,
    ): { status: number | null; stderr: string } {
      const env: Record<string, string> = {
        ...process.env,
        NODE_ENV: "production",
      };
      if (csrfSecret !== undefined) {
        env.CSRF_SECRET = csrfSecret;
      } else {
        delete env.CSRF_SECRET;
      }
      if (betterAuthSecret !== undefined) {
        env.BETTER_AUTH_SECRET = betterAuthSecret;
      } else {
        delete env.BETTER_AUTH_SECRET;
      }
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", BOOT_SCRIPT],
        { env, encoding: "utf8", timeout: 60_000 },
      );
      return { status: result.status, stderr: result.stderr ?? "" };
    }

    it("fails to boot in production without any secret", () => {
      const { status, stderr } = bootSecurityInProduction(undefined, undefined);
      expect(status).not.toBe(0);
      expect(stderr).toContain("CSRF_SECRET");
    });

    it("fails to boot in production with the known placeholder secret", () => {
      const { status, stderr } = bootSecurityInProduction(
        "dev-secret-change-me-before-deploy",
        undefined,
      );
      expect(status).not.toBe(0);
      expect(stderr).toContain("CSRF_SECRET");
    });

    it("boots in production with a real CSRF secret", () => {
      const { status } = bootSecurityInProduction(
        "a-strong-random-secret-that-is-not-a-placeholder-0123456789",
        undefined,
      );
      expect(status).toBe(0);
    });

    it("boots in production using a real BETTER_AUTH_SECRET fallback", () => {
      const { status } = bootSecurityInProduction(
        undefined,
        "a-strong-random-secret-that-is-not-a-placeholder-0123456789",
      );
      expect(status).toBe(0);
    });
  });
});
