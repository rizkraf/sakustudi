import { and, desc, eq, isNotNull, sum, type SQL } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { attachments, dataExports } from "~/lib/db/schema";

const db = getDb();

export type AttachmentRow = typeof attachments.$inferSelect;

/** Attachment parent supported by the MVP UI: notes and activities. */
export type AttachmentParent = {
  kind: "note" | "activity";
  id: string;
};

export type AttachmentInsert = {
  filename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};

function parentCondition(parent: AttachmentParent): SQL {
  return parent.kind === "note"
    ? eq(attachments.noteId, parent.id)
    : eq(attachments.activityId, parent.id);
}

/**
 * Inserts attachment metadata. The object itself is written to storage
 * before this row exists (service order), so a crash in between leaves an
 * orphan object that the cleanup worker removes.
 */
export async function insertAttachment(
  userId: string,
  parent: AttachmentParent,
  input: AttachmentInsert,
): Promise<AttachmentRow> {
  const [row] = await db
    .insert(attachments)
    .values({
      userId,
      filename: input.filename,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
      noteId: parent.kind === "note" ? parent.id : null,
      activityId: parent.kind === "activity" ? parent.id : null,
    })
    .returning();
  return row;
}

export async function findOwnedAttachment(
  userId: string,
  attachmentId: string,
): Promise<AttachmentRow | undefined> {
  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.userId, userId), eq(attachments.id, attachmentId)))
    .limit(1);
  return row;
}

export async function listParentAttachments(
  userId: string,
  parent: AttachmentParent,
): Promise<AttachmentRow[]> {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.userId, userId), parentCondition(parent)))
    .orderBy(desc(attachments.createdAt));
}

/** Deletes the row and returns it (for storage cleanup) or undefined. */
export async function deleteOwnedAttachment(
  userId: string,
  attachmentId: string,
): Promise<AttachmentRow | undefined> {
  const [row] = await db
    .delete(attachments)
    .where(and(eq(attachments.userId, userId), eq(attachments.id, attachmentId)))
    .returning();
  return row;
}

export async function sumOwnedAttachmentBytes(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(attachments.sizeBytes) })
    .from(attachments)
    .where(eq(attachments.userId, userId));
  return Number(row?.total ?? 0);
}

/** Every storage key with metadata, for orphan detection. */
export async function listAllStorageKeys(): Promise<string[]> {
  const rows = await db.select({ storageKey: attachments.storageKey }).from(attachments);
  const exports = await db
    .select({ fileUrl: dataExports.fileUrl })
    .from(dataExports)
    .where(isNotNull(dataExports.fileUrl));
  return [
    ...rows.map((row) => row.storageKey),
    ...exports.map((row) => row.fileUrl).filter((key): key is string => Boolean(key)),
  ];
}
