import { and, arrayContains, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { courses, notes } from "~/lib/db/schema";

const db = getDb();

export type NoteRow = typeof notes.$inferSelect;
export type NoteTag = string;

/**
 * Search result summary: identity, course display name (joined), tags, and a
 * plain-text excerpt for list rendering. `contentText` is the searchable
 * plain-text field persisted at write time.
 */
export type NoteSummary = {
  id: string;
  title: string;
  courseId: string | null;
  courseName: string | null;
  tags: NoteTag[];
  contentText: string;
  updatedAt: Date;
  createdAt: Date;
};

export type NoteInsert = {
  courseId: string | null;
  termId: string | null;
  title: string;
  content: string;
  contentText: string;
  tags: NoteTag[];
};

export type NoteUpdate = {
  courseId?: string | null;
  termId?: string | null;
  title?: string;
  content?: string;
  contentText?: string;
  tags?: NoteTag[];
};

export async function findOwnedNote(
  userId: string,
  noteId: string,
): Promise<NoteRow | undefined> {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, noteId)))
    .limit(1);
  return row;
}

export async function insertNote(userId: string, input: NoteInsert): Promise<NoteRow> {
  const [row] = await db
    .insert(notes)
    .values({
      userId,
      courseId: input.courseId,
      termId: input.termId,
      title: input.title,
      content: input.content,
      contentText: input.contentText,
      tags: input.tags,
    })
    .returning();
  return row;
}

export async function updateOwnedNote(
  userId: string,
  noteId: string,
  input: NoteUpdate,
): Promise<NoteRow | undefined> {
  const [row] = await db
    .update(notes)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(notes.userId, userId), eq(notes.id, noteId)))
    .returning();
  return row;
}

export async function deleteOwnedNote(userId: string, noteId: string): Promise<boolean> {
  const rows = await db
    .delete(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, noteId)))
    .returning({ id: notes.id });
  return rows.length > 0;
}

/**
 * Escapes LIKE wildcards so user input matches literally. The pattern is
 * bound as a parameter by drizzle — the escape only guards wildcard
 * semantics, never SQL injection.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Searches the user's notes. Free text matches the persisted plain-text
 * field (`content_text`) and the title only — raw HTML is never searched.
 * Filters: optional courseId and a single tag (notes carrying that tag via
 * array containment). Results are ordered by most recently updated first.
 */
export async function searchNotes(
  userId: string,
  query: string,
  filters: { courseId?: string | null; tag?: string | null },
  limit = 100,
): Promise<NoteSummary[]> {
  const conditions: (SQL | undefined)[] = [eq(notes.userId, userId)];

  if (query.length > 0) {
    const pattern = `%${escapeLikePattern(query)}%`;
    conditions.push(
      or(ilike(notes.contentText, pattern), ilike(notes.title, pattern)),
    );
  }
  if (filters.courseId) {
    conditions.push(eq(notes.courseId, filters.courseId));
  }
  if (filters.tag) {
    conditions.push(arrayContains(notes.tags, [filters.tag]));
  }

  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      courseId: notes.courseId,
      courseName: courses.name,
      tags: notes.tags,
      contentText: notes.contentText,
      updatedAt: notes.updatedAt,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .leftJoin(courses, eq(notes.courseId, courses.id))
    .where(and(...conditions))
    .orderBy(desc(notes.updatedAt))
    .limit(limit);

  return rows;
}
