import { AppError } from "~/lib/errors/AppError";
import { findOwnedCourse } from "~/modules/courses/courses.repository";
import { zodIssuesToFieldErrors } from "~/modules/shared/zod";
import { usefulLinkSchema, type CreateUsefulLinkInput } from "../notes/notes.schema";
import {
  deleteOwnedUsefulLink,
  insertUsefulLink,
  listUsefulLinks as selectUsefulLinks,
  type UsefulLinkRow,
} from "./links.repository";

export type { UsefulLinkRow };

/**
 * Lists the user's useful links, scoped to a course when courseId is given.
 */
export async function listUsefulLinks(
  userId: string,
  courseId?: string | null,
): Promise<UsefulLinkRow[]> {
  return selectUsefulLinks(userId, courseId);
}

/**
 * Creates a user-owned useful link. Only http(s) URLs are accepted; a
 * courseId must reference one of the user's courses.
 */
export async function createUsefulLink(
  userId: string,
  input: CreateUsefulLinkInput,
): Promise<UsefulLinkRow> {
  const parsed = usefulLinkSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  let courseId: string | null = null;
  if (parsed.data.courseId) {
    const course = await findOwnedCourse(userId, parsed.data.courseId);
    if (!course) {
      throw new AppError("NOT_FOUND", "Course not found.");
    }
    courseId = course.id;
  }

  return insertUsefulLink(userId, {
    title: parsed.data.title,
    url: parsed.data.url,
    description: parsed.data.description ?? null,
    category: parsed.data.category ?? null,
    courseId,
  });
}

export async function deleteUsefulLink(userId: string, linkId: string): Promise<void> {
  const deleted = await deleteOwnedUsefulLink(userId, linkId);
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Link not found.");
  }
}
