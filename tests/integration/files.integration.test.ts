import { createHash, randomUUID } from "node:crypto";
import { stat, writeFile } from "node:fs/promises";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inArray } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import { seedCatalog } from "~/lib/db/seed";
import { sessionUserContext } from "~/context";
import {
  createCsrfToken,
  CSRF_COOKIE_NAME,
} from "~/lib/request/security.server";
import { localStorageRoot } from "~/lib/storage/local-storage.server";
import {
  findOrphanObjects,
  resolveStorage,
  validateUpload,
  type ChecksumStorage,
  type ListableStorage,
} from "~/lib/storage/storage";
import { user } from "~/lib/db/schema";
import { action as noteDetailAction } from "~/routes/notes.$noteId";
import { insertNote } from "~/modules/notes/notes.repository";
import { insertActivity } from "~/modules/activities/activities.repository";
import { createAcademicTerm } from "~/modules/academic-terms/terms.service";
import { createCustomCourse } from "~/modules/catalog/catalog.service";
import {
  createAttachment,
  deleteAttachment,
  downloadAttachment,
  listOrphanObjects,
  listParentAttachments,
} from "~/modules/files/files.service";
import { listAllStorageKeys } from "~/modules/files/files.repository";
import { AppError } from "~/lib/errors/AppError";

const db = getDb();
const createdUserIds: string[] = [];

const TEST_STORAGE_ROOT = join(
  tmpdir(),
  `sakustudi-files-int-${crypto.randomUUID()}`,
);

const PDF_BYTES = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"),
  Buffer.alloc(100, 0x20),
]);
const QUOTA_PDF_BYTES = Buffer.concat([PDF_BYTES, Buffer.alloc(1400, 0x21)]);
const BIG_PDF_BYTES = Buffer.concat([PDF_BYTES, Buffer.alloc(5000, 0x21)]);

function pdfFile(name = "lecture-notes.pdf"): File {
  return new File([new Uint8Array(PDF_BYTES)], name, { type: "application/pdf" });
}

function newUserId(): string {
  const id = crypto.randomUUID();
  createdUserIds.push(id);
  return id;
}

async function createUser(id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: "Files Integration User",
    email: `${id}@files-int.test`,
    emailVerified: true,
  });
}

async function createUserWithParents(): Promise<{
  userId: string;
  noteId: string;
  activityId: string;
}> {
  const userId = newUserId();
  await createUser(userId);
  const term = await createAcademicTerm(userId, {
    name: "Gasal 2026/2027",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2027-02-28T00:00:00Z"),
  });
  const course = await createCustomCourse(userId, term.id, {
    name: "Struktur Data",
    code: "KDST4101",
  });
  const note = await insertNote(userId, {
    courseId: course.id,
    termId: term.id,
    title: "Files note",
    content: "<p>note body</p>",
    contentText: "note body",
    tags: [],
  });
  const activity = await insertActivity(userId, {
    courseId: course.id,
    termId: term.id,
    title: "Files activity",
    type: "assignment",
    dueDate: new Date("2026-11-01T00:00:00Z"),
    details: null,
    link: null,
  });
  return { userId, noteId: note.id, activityId: activity.id };
}

function expectAppError(error: unknown, code: string): {
  message?: string;
  fieldErrors?: Record<string, string[]>;
} {
  expect(error).toBeInstanceOf(Error);
  const candidate = error as {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
  };
  expect(candidate.code).toBe(code);
  return candidate;
}

describe("private file storage integration", () => {
  beforeAll(async () => {
    process.env.STORAGE_LOCAL_ROOT = TEST_STORAGE_ROOT;
    process.env.MAX_UPLOAD_BYTES = "4096";
    process.env.MAX_STORAGE_BYTES = "2048";
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seedCatalog(db);
    await mkdir(TEST_STORAGE_ROOT, { recursive: true });
  }, 60_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }
    await closeDb();
    await rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
  });

  it("stores objects outside the web root under random keys, never the filename", async () => {
    const { userId, noteId } = await createUserWithParents();

    const attachment = await createAttachment(userId, { kind: "note", id: noteId }, pdfFile());

    expect(attachment.userId).toBe(userId);
    expect(attachment.noteId).toBe(noteId);
    expect(attachment.activityId).toBeNull();
    expect(attachment.filename).toBe("lecture-notes.pdf");
    expect(attachment.mimeType).toBe("application/pdf");
    expect(attachment.sizeBytes).toBe(PDF_BYTES.byteLength);
    expect(attachment.checksum).toBe(createHash("sha256").update(PDF_BYTES).digest("hex"));
    expect(attachment.storageKey).not.toContain("lecture-notes");
    expect(attachment.storageKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Private storage behavior: the root is configured outside public/build
    // and the object lives only at its random key inside it.
    const root = localStorageRoot();
    expect(root).toBe(TEST_STORAGE_ROOT);
    expect(root.split(/[\\/]/)).not.toContain("public");
    expect(root.split(/[\\/]/)).not.toContain("build");

    const storage = (await resolveStorage()) as ListableStorage;
    expect(await storage.exists(attachment.storageKey)).toBe(true);
    expect((await storage.listKeys()).map((key) => key.split(/[\\/]/).pop())).toContain(
      attachment.storageKey,
    );
    expect((await storage.listKeys()).join("\n")).not.toContain("lecture-notes");
  });

  it("downloads an owned attachment with matching bytes and headers", async () => {
    const { userId, noteId } = await createUserWithParents();
    const attachment = await createAttachment(userId, { kind: "note", id: noteId }, pdfFile());

    const response = await downloadAttachment(userId, attachment.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe(String(PDF_BYTES.byteLength));
    expect(response.headers.get("content-disposition")).toContain('filename="lecture-notes.pdf"');

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(PDF_BYTES)).toBe(true);
  });

  it("refuses to download an object whose checksum no longer matches", async () => {
    const { userId, noteId } = await createUserWithParents();
    const attachment = await createAttachment(userId, { kind: "note", id: noteId }, pdfFile());

    // Tamper with the stored object after insert: the metadata checksum no
    // longer matches the bytes on disk, so the download must fail even though
    // the object exists and the user owns the row.
    const tampered = Buffer.concat([PDF_BYTES, Buffer.from("tampered")]);
    await writeFile(join(TEST_STORAGE_ROOT, attachment.storageKey), tampered);

    const storage = (await resolveStorage()) as ChecksumStorage;
    expect(await storage.checksum(attachment.storageKey)).not.toBe(attachment.checksum);

    const error = expectAppError(
      await downloadAttachment(userId, attachment.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    expect(error.message).toContain("damaged");

    // The corrupted attachment can still be deleted; deletion is unaffected
    // by the integrity check.
    await deleteAttachment(userId, attachment.id);
    expect(await listParentAttachments(userId, { kind: "note", id: noteId })).toHaveLength(0);
  });

  it("lists attachments scoped to their parent", async () => {
    const { userId, noteId, activityId } = await createUserWithParents();
    const noteAttachment = await createAttachment(userId, { kind: "note", id: noteId }, pdfFile("note.pdf"));
    await createAttachment(userId, { kind: "activity", id: activityId }, pdfFile("activity.pdf"));

    const noteFiles = await listParentAttachments(userId, { kind: "note", id: noteId });
    expect(noteFiles.map((file) => file.id)).toEqual([noteAttachment.id]);

    const activityFiles = await listParentAttachments(userId, { kind: "activity", id: activityId });
    expect(activityFiles.map((file) => file.filename)).toEqual(["activity.pdf"]);
  });

  it("hides other users' attachments from download, delete, and list", async () => {
    const owner = await createUserWithParents();
    const attachment = await createAttachment(owner.userId, { kind: "note", id: owner.noteId }, pdfFile());
    const attacker = newUserId();
    await createUser(attacker);

    expectAppError(
      await downloadAttachment(attacker, attachment.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    expectAppError(
      await deleteAttachment(attacker, attachment.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    expect(await listParentAttachments(attacker, { kind: "note", id: owner.noteId })).toHaveLength(0);
    expect((await downloadAttachment(owner.userId, attachment.id)).status).toBe(200);
  });

  it("rejects attachments to parents the user does not own", async () => {
    const owner = await createUserWithParents();
    const attacker = newUserId();
    await createUser(attacker);

    const error = expectAppError(
      await createAttachment(attacker, { kind: "note", id: owner.noteId }, pdfFile()).catch(
        (caught) => caught,
      ),
      "NOT_FOUND",
    );
    expect(error.message).toBe("Note not found.");
  });

  it("enforces the user storage quota via MAX_STORAGE_BYTES", async () => {
    const { userId, noteId } = await createUserWithParents();
    await createAttachment(
      userId,
      { kind: "note", id: noteId },
      new File([new Uint8Array(QUOTA_PDF_BYTES)], "first.pdf", { type: "application/pdf" }),
    );

    expectAppError(
      await createAttachment(
        userId,
        { kind: "note", id: noteId },
        new File([new Uint8Array(QUOTA_PDF_BYTES)], "second.pdf", { type: "application/pdf" }),
      ).catch((caught) => caught),
      "LIMIT_EXCEEDED",
    );
    expect(await listParentAttachments(userId, { kind: "note", id: noteId })).toHaveLength(1);
  });

  it("enforces the per-file size cap via MAX_UPLOAD_BYTES", async () => {
    const { userId, noteId } = await createUserWithParents();

    const error = expectAppError(
      await createAttachment(
        userId,
        { kind: "note", id: noteId },
        new File([new Uint8Array(BIG_PDF_BYTES)], "big.pdf", { type: "application/pdf" }),
      ).catch((caught) => caught),
      "LIMIT_EXCEEDED",
    );
    expect(error.message).toContain("or smaller");

    expect(await listParentAttachments(userId, { kind: "note", id: noteId })).toHaveLength(0);
  });

  it("rejects MIME spoofing and path traversal through the service", async () => {
    const { userId, noteId } = await createUserWithParents();

    const spoof = await createAttachment(
      userId,
      { kind: "note", id: noteId },
      new File([new Uint8Array(PDF_BYTES)], "notes.png", { type: "image/png" }),
    ).catch((caught) => caught);
    expectAppError(spoof, "VALIDATION_FAILED");
    expect((spoof as AppError).fieldErrors?.file?.[0]).toContain("contents");

    const traversal = await createAttachment(
      userId,
      { kind: "note", id: noteId },
      new File([new Uint8Array(PDF_BYTES)], "../escape.pdf", { type: "application/pdf" }),
    ).catch((caught) => caught);
    expectAppError(traversal, "VALIDATION_FAILED");

    expect(await listParentAttachments(userId, { kind: "note", id: noteId })).toHaveLength(0);
  });

  it("deletes the row and the object, and stays idempotent", async () => {
    const { userId, noteId } = await createUserWithParents();
    const attachment = await createAttachment(userId, { kind: "note", id: noteId }, pdfFile());
    const storage = await resolveStorage();
    expect(await storage.exists(attachment.storageKey)).toBe(true);

    await deleteAttachment(userId, attachment.id);

    expect(await storage.exists(attachment.storageKey)).toBe(false);
    expect(await listParentAttachments(userId, { kind: "note", id: noteId })).toHaveLength(0);

    // Retrying the delete reports not found; deleting the object again is a
    // silent no-op.
    expectAppError(
      await deleteAttachment(userId, attachment.id).catch((caught) => caught),
      "NOT_FOUND",
    );
    await expect(storage.delete(attachment.storageKey)).resolves.toBeUndefined();
  });

  it("detects orphaned objects with no metadata row (after grace period)", async () => {
    const { userId, noteId } = await createUserWithParents();
    const storage = (await resolveStorage()) as ListableStorage;

    const orphanKey = randomUUID();
    const validated = await validateUpload(pdfFile());
    await storage.put({
      key: orphanKey,
      body: validated.buffer,
      contentType: validated.mimeType,
      size: validated.sizeBytes,
      checksum: validated.checksum,
    });

    // Fresh objects are protected by the grace period even without metadata.
    const beforeGrace = await listOrphanObjects();
    expect(beforeGrace).not.toContain(orphanKey);
    const zeroGrace = await findOrphanObjects(storage, [], 0);
    expect(zeroGrace).toContain(orphanKey);

    const attachment = await createAttachment(userId, { kind: "note", id: noteId }, pdfFile());
    const afterUpload = await findOrphanObjects(storage, await listAllStorageKeys(), 0);
    expect(afterUpload).not.toContain(attachment.storageKey);
    expect(afterUpload).toContain(orphanKey);

    // The helper itself must diff against the full metadata set: with every
    // DB key known, only the manually planted object remains an orphan.
    const byKnownSet = await findOrphanObjects(storage, await listAllStorageKeys(), 0);
    expect(byKnownSet).toEqual([orphanKey]);

    await storage.delete(orphanKey);
    expect(await findOrphanObjects(storage, [], 0)).not.toContain(orphanKey);
  });

  it("rejects unsafe storage keys with FORBIDDEN", async () => {
    const storage = await resolveStorage();
    await expect(storage.get("../etc/passwd")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(storage.delete("a/b")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(storage.exists("..")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("applies restrictive file permissions on POSIX systems", async () => {
    if (process.platform === "win32") return;
    const { userId, noteId } = await createUserWithParents();
    const attachment = await createAttachment(userId, { kind: "note", id: noteId }, pdfFile());

    const info = await stat(join(TEST_STORAGE_ROOT, attachment.storageKey));
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("attaches and deletes files through the note detail route action with CSRF", async () => {
    const { userId, noteId } = await createUserWithParents();

    const token = createCsrfToken(userId);
    const request = new Request(`http://localhost:3000/notes/${noteId}`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
      body: (() => {
        const form = new FormData();
        form.set("intent", "attach-file");
        form.set("csrfToken", token);
        form.set("file", pdfFile("via-route.pdf"));
        return form;
      })(),
    });
    const context = new RouterContextProvider();
    context.set(sessionUserContext, {
      id: userId,
      email: `${userId}@files-int.test`,
      name: "Files Integration User",
    });

    let redirectResponse: Response | undefined;
    try {
      await noteDetailAction({ request, params: { noteId }, context } as never);
    } catch (error) {
      if (error instanceof Response) redirectResponse = error;
      else throw error;
    }

    expect(redirectResponse).toBeDefined();
    expect(redirectResponse!.status).toBe(302);

    const files = await listParentAttachments(userId, { kind: "note", id: noteId });
    expect(files.map((file) => file.filename)).toEqual(["via-route.pdf"]);

    const deleteRequest = new Request(`http://localhost:3000/notes/${noteId}`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
      },
      body: (() => {
        const form = new FormData();
        form.set("intent", "delete-attachment");
        form.set("csrfToken", token);
        form.set("attachmentId", files[0].id);
        return form;
      })(),
    });
    let deleteRedirect: Response | undefined;
    try {
      await noteDetailAction({ request: deleteRequest, params: { noteId }, context } as never);
    } catch (error) {
      if (error instanceof Response) deleteRedirect = error;
      else throw error;
    }
    expect(deleteRedirect).toBeDefined();
    expect(await listParentAttachments(userId, { kind: "note", id: noteId })).toHaveLength(0);
  });
});
