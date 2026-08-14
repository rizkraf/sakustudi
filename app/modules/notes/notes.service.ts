import { AppError } from "~/lib/errors/AppError";
import { extractPlainText } from "~/lib/content/plain-text";
import { sanitizeNoteHtml } from "~/lib/content/sanitize";
import { findOwnedCourse } from "~/modules/courses/courses.repository";
import { zodIssuesToFieldErrors } from "~/modules/shared/zod";
import {
  createNoteSchema,
  noteSearchSchema,
  updateNoteSchema,
  type CreateNoteInput,
  type NoteSearchInput,
  type UpdateNoteInput,
} from "./notes.schema";
import {
  deleteOwnedNote,
  findOwnedNote,
  insertNote,
  searchNotes as selectNotes,
  updateOwnedNote,
  type NoteRow,
  type NoteSummary,
} from "./notes.repository";

export type Note = NoteRow;

export { type NoteSummary };

/**
 * Creates a note for the user. HTML is sanitized before the database write;
 * the searchable plain-text field is generated from the sanitized output. A
 * courseId binds the note to an owned course and inherits its term.
 */
export async function createNote(
  userId: string,
  input: CreateNoteInput,
): Promise<Note> {
  const parsed = createNoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  let courseId: string | null = null;
  let termId: string | null = null;
  if (parsed.data.courseId) {
    const course = await findOwnedCourse(userId, parsed.data.courseId);
    if (!course) {
      throw new AppError("NOT_FOUND", "Course not found.");
    }
    courseId = course.id;
    termId = course.termId;
  }

  const content = sanitizeNoteHtml(parsed.data.contentHtml ?? "");
  return insertNote(userId, {
    courseId,
    termId,
    title: parsed.data.title,
    content,
    contentText: extractPlainText(content),
    tags: parsed.data.tags ?? [],
  });
}

/**
 * Updates an owned note. Omitted fields are kept; provided content is
 * re-sanitized and re-indexed into the plain-text field.
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<Note> {
  const parsed = updateNoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  const existing = await findOwnedNote(userId, noteId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Note not found.");
  }

  let courseId = existing.courseId;
  let termId = existing.termId;
  if (parsed.data.courseId !== undefined && parsed.data.courseId !== existing.courseId) {
    if (parsed.data.courseId === null) {
      courseId = null;
      termId = null;
    } else {
      const course = await findOwnedCourse(userId, parsed.data.courseId);
      if (!course) {
        throw new AppError("NOT_FOUND", "Course not found.");
      }
      courseId = course.id;
      termId = course.termId;
    }
  }

  const content =
    parsed.data.contentHtml !== undefined
      ? sanitizeNoteHtml(parsed.data.contentHtml)
      : (existing.content ?? "");

  const updated = await updateOwnedNote(userId, noteId, {
    courseId,
    termId,
    title: parsed.data.title ?? existing.title,
    content,
    contentText:
      parsed.data.contentHtml !== undefined
        ? extractPlainText(content)
        : (existing.contentText ?? ""),
    tags: parsed.data.tags !== undefined ? parsed.data.tags : (existing.tags ?? []),
  });
  if (!updated) {
    throw new AppError("NOT_FOUND", "Note not found.");
  }
  return updated;
}

export async function getNote(userId: string, noteId: string): Promise<Note> {
  const row = await findOwnedNote(userId, noteId);
  if (!row) {
    throw new AppError("NOT_FOUND", "Note not found.");
  }
  return row;
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const deleted = await deleteOwnedNote(userId, noteId);
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Note not found.");
  }
}

/**
 * Validated search over the user's notes: query plus optional course and tag
 * filters. Searching happens only on the plain-text field (and title).
 */
export async function searchNotes(
  userId: string,
  input: NoteSearchInput,
): Promise<NoteSummary[]> {
  const parsed = noteSearchSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the search filters.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }
  return selectNotes(userId, parsed.data.query, {
    courseId: parsed.data.courseId,
    tag: parsed.data.tag,
  });
}
