import { AppError } from "~/lib/errors/AppError";
import {
  findOrphanObjects,
  formatBytes,
  maxStorageBytes,
  resolveStorage,
  validateUpload,
  type ListableStorage,
} from "~/lib/storage/storage";
import { findOwnedActivity } from "~/modules/activities/activities.repository";
import { findOwnedNote } from "~/modules/notes/notes.repository";

import {
  deleteOwnedAttachment,
  findOwnedAttachment,
  insertAttachment,
  listAllStorageKeys,
  listParentAttachments as selectParentAttachments,
  sumOwnedAttachmentBytes,
  type AttachmentParent,
  type AttachmentRow,
} from "./files.repository";

export type Attachment = AttachmentRow;

export { formatBytes, maxUploadBytes } from "~/lib/storage/storage";
export { type AttachmentParent } from "./files.repository";

export function listParentAttachments(
  userId: string,
  parent: AttachmentParent,
): Promise<Attachment[]> {
  return selectParentAttachments(userId, parent);
}

/**
 * Creates an attachment for an owned parent (note or activity), streams the
 * validated file into storage, then writes metadata. Order matters: the
 * object lands first, so a crashed metadata write leaves an orphan object
 * (removed by the cleanup worker) rather than a broken attachment row.
 * Client-supplied parent ids are re-checked against the user's own records.
 */
export async function createAttachment(
  userId: string,
  parent: AttachmentParent,
  file: File,
): Promise<Attachment> {
  await assertOwnedParent(userId, parent);

  const validated = await validateUpload(file);

  const used = await sumOwnedAttachmentBytes(userId);
  if (used + validated.sizeBytes > maxStorageBytes()) {
    throw new AppError(
      "LIMIT_EXCEEDED",
      `Your storage is full (${formatBytes(maxStorageBytes())} limit).`,
    );
  }

  const storage = await resolveStorage();
  const stored = await storage.put({
    key: validated.storageKey,
    body: validated.buffer,
    contentType: validated.mimeType,
    size: validated.sizeBytes,
    checksum: validated.checksum,
  });

  try {
    return await insertAttachment(userId, parent, {
      filename: validated.filename,
      storageKey: stored.key,
      mimeType: validated.mimeType,
      sizeBytes: stored.size,
    });
  } catch (error) {
    // The object landed but the metadata write failed: remove the object so
    // nothing is left without a row (best effort; delete is idempotent).
    await storage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}

/**
 * Streams an owned attachment back as a download response. Ownership is
 * checked before storage is touched; the object is served through the app
 * handler so storage credentials are never exposed to the browser.
 */
export async function downloadAttachment(
  userId: string,
  attachmentId: string,
): Promise<Response> {
  const row = await findOwnedAttachment(userId, attachmentId);
  if (!row) {
    throw new AppError("NOT_FOUND", "Attachment not found.");
  }

  const storage = await resolveStorage();
  let stream: ReadableStream;
  try {
    stream = await storage.get(row.storageKey);
  } catch (error) {
    if (isObjectMissing(error)) {
      throw new AppError("NOT_FOUND", "The stored file is missing.");
    }
    throw error;
  }

  const headers: Record<string, string> = {
    "Content-Type": row.mimeType ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(row.filename),
    "Cache-Control": "private, no-store",
  };
  if (row.sizeBytes !== null) {
    headers["Content-Length"] = String(row.sizeBytes);
  }
  return new Response(stream, { headers });
}

/**
 * Deletes an owned attachment. The metadata row is removed first, then the
 * object; a failed object removal leaves an orphan that the cleanup worker
 * picks up, and object deletion itself is idempotent (already-absent objects
 * are fine).
 */
export async function deleteAttachment(
  userId: string,
  attachmentId: string,
): Promise<void> {
  const row = await findOwnedAttachment(userId, attachmentId);
  if (!row) {
    throw new AppError("NOT_FOUND", "Attachment not found.");
  }

  const deleted = await deleteOwnedAttachment(userId, attachmentId);
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Attachment not found.");
  }

  const storage = await resolveStorage();
  try {
    await storage.delete(row.storageKey);
  } catch {
    // Row is gone; a leftover object becomes an orphan the cleanup worker
    // removes later. Deletion stays idempotent on the object side.
  }
}

/**
 * Storage keys with no attachment metadata row — the orphan set the Task 10
 * cleanup worker will sweep after its grace period. Reading all keys from
 * the active adapter keeps this driver-agnostic.
 */
export async function listOrphanObjects(): Promise<string[]> {
  const storage = await resolveStorage();
  const knownKeys = await listAllStorageKeys();
  return findOrphanObjects(storage as ListableStorage, knownKeys);
}

async function assertOwnedParent(
  userId: string,
  parent: AttachmentParent,
): Promise<void> {
  const owned =
    parent.kind === "note"
      ? await findOwnedNote(userId, parent.id)
      : await findOwnedActivity(userId, parent.id);
  if (!owned) {
    throw new AppError(
      "NOT_FOUND",
      `${parent.kind === "note" ? "Note" : "Activity"} not found.`,
    );
  }
}

function isObjectMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; name?: string };
  return candidate.code === "ENOENT" || candidate.name === "NoSuchKey";
}

/**
 * Attachment Content-Disposition. The fallback filename is ASCII-safe (no
 * quotes, backslashes, or CR/LF header injection); the UTF-8 filename* form
 * carries the original name for non-ASCII filenames.
 */
function contentDisposition(filename: string): string {
  const ascii = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\\r\n]/g, "_") || "_";
  const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
