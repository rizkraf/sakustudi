import { z } from "zod";

import { AppError } from "~/lib/errors/AppError";
import { getDb } from "~/lib/db/client";
import { courses } from "~/lib/db/schema";
import { findOwnedTerm } from "~/modules/academic-terms/terms.repository";
import { zodIssuesToFieldErrors } from "~/modules/shared/zod";
import {
  findActiveCatalogCourse,
  selectCatalogCourses,
  type CatalogQuery,
  type CourseCatalogItem,
} from "./catalog.repository";

export const customCourseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Course name is required.")
    .max(100, "Course name must be 100 characters or fewer."),
  code: z
    .string()
    .trim()
    .max(20, "Course code must be 20 characters or fewer.")
    .optional(),
});

export type CustomCourseInput = {
  name: string;
  code?: string;
};

export type { CatalogQuery, CourseCatalogItem };

export function listCatalogCourses(
  userId: string,
  query: CatalogQuery,
): Promise<CourseCatalogItem[]> {
  return selectCatalogCourses(userId, query);
}

/**
 * Copies a catalog course's identity into the user-owned course relation.
 * Catalog rows are never mutated; the copy is a snapshot (name, code,
 * credits) plus the catalog reference for provenance.
 */
export async function createCourseFromCatalog(
  userId: string,
  termId: string,
  catalogCourseId: string,
): Promise<typeof courses.$inferSelect> {
  const term = await findOwnedTerm(userId, termId);
  if (!term) {
    throw new AppError("NOT_FOUND", "Term not found.");
  }

  const catalogCourse = await findActiveCatalogCourse(userId, catalogCourseId);
  if (!catalogCourse) {
    throw new AppError("NOT_FOUND", "Catalog course not found.");
  }

  const db = getDb();
  const [row] = await db
    .insert(courses)
    .values({
      userId,
      termId,
      catalogId: catalogCourse.id,
      name: catalogCourse.name,
      code: catalogCourse.code,
      credits: catalogCourse.credits,
      status: "planned",
    })
    .returning();
  return row;
}

/** Creates a user-typed course with no catalog reference. */
export async function createCustomCourse(
  userId: string,
  termId: string,
  input: CustomCourseInput,
): Promise<typeof courses.$inferSelect> {
  const parsed = customCourseSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  const term = await findOwnedTerm(userId, termId);
  if (!term) {
    throw new AppError("NOT_FOUND", "Term not found.");
  }

  const db = getDb();
  const code = parsed.data.code === "" ? undefined : parsed.data.code;
  const [row] = await db
    .insert(courses)
    .values({
      userId,
      termId,
      catalogId: null,
      name: parsed.data.name,
      code: code ?? null,
      credits: null,
      status: "planned",
    })
    .returning();
  return row;
}
