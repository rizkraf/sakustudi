import { and, eq } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { attachments, notes } from "~/lib/db/schema";

/**
 * Repository convention: every repository function takes userId as its first
 * argument and includes it in every select/update/delete predicate, so no
 * query can ever touch another user's rows. requireOwnedUser (authorization/
 * ownership.server.ts) remains as a defense-in-depth guard on top.
 *
 * These note/attachment helpers are demonstrative contracts for the shared
 * module; feature repositories land in Tasks 6-11.
 */

const db = getDb();

export type NotePatch = Partial<
  Pick<typeof notes.$inferInsert, "title" | "content" | "pinned">
>;

export async function findOwnedNote(
  userId: string,
  noteId: string,
): Promise<typeof notes.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  return row;
}

export async function updateOwnedNote(
  userId: string,
  noteId: string,
  patch: NotePatch,
): Promise<typeof notes.$inferSelect | undefined> {
  const [row] = await db
    .update(notes)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning();
  return row;
}

export async function deleteOwnedNote(userId: string, noteId: string): Promise<boolean> {
  const rows = await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return rows.length > 0;
}

export type AttachmentDownload = {
  storageKey: string;
  filename: string;
  mimeType: string | null;
};

export async function findOwnedAttachmentForDownload(
  userId: string,
  attachmentId: string,
): Promise<AttachmentDownload | undefined> {
  const [row] = await db
    .select({
      storageKey: attachments.storageKey,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
    })
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.userId, userId)))
    .limit(1);
  return row;
}
