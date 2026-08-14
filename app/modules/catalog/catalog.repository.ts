import { and, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { courseCatalog, courses, studyPrograms } from "~/lib/db/schema";

/**
 * Catalog rows are seed-owned and read-only for users: every query here is
 * SELECT-only against active rows. Following the repository convention, userId
 * stays the first argument even though catalog rows are not user-scoped, so
 * feature code never mixes owner and catalog concerns.
 */

const db = getDb();

export type CatalogQuery = {
  programId?: string;
  search?: string;
};

export type CourseCatalogItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  credits: number;
  studyProgramId: string | null;
  studyProgramCode: string | null;
  studyProgramName: string | null;
};

export type StudyProgramItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

/**
 * Normalizes free-text search: trims, lowercases, collapses whitespace, and
 * escapes LIKE wildcards so user input matches literally.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[%_]/g, (ch) => `\\${ch}`);
}

export async function selectCatalogCourses(
  userId: string,
  query: CatalogQuery = {},
): Promise<CourseCatalogItem[]> {
  void userId;

  const conditions: SQL[] = [eq(courseCatalog.isActive, true)];
  if (query.programId) {
    conditions.push(
      or(
        eq(courseCatalog.studyProgramId, query.programId),
        isNull(courseCatalog.studyProgramId),
      )!,
    );
  }
  if (query.search) {
    const pattern = `%${normalizeSearchTerm(query.search)}%`;
    conditions.push(
      or(
        ilike(courseCatalog.name, pattern),
        ilike(courseCatalog.code, pattern),
      )!,
    );
  }

  return db
    .select({
      id: courseCatalog.id,
      code: courseCatalog.code,
      name: courseCatalog.name,
      description: courseCatalog.description,
      credits: courseCatalog.credits,
      studyProgramId: courseCatalog.studyProgramId,
      studyProgramCode: studyPrograms.code,
      studyProgramName: studyPrograms.name,
    })
    .from(courseCatalog)
    .leftJoin(
      studyPrograms,
      eq(courseCatalog.studyProgramId, studyPrograms.id),
    )
    .where(and(...conditions))
    .orderBy(courseCatalog.code);
}

export async function listActiveStudyPrograms(
  userId: string,
): Promise<StudyProgramItem[]> {
  void userId;

  return db
    .select({
      id: studyPrograms.id,
      code: studyPrograms.code,
      name: studyPrograms.name,
      description: studyPrograms.description,
    })
    .from(studyPrograms)
    .where(eq(studyPrograms.isActive, true))
    .orderBy(studyPrograms.code);
}

/** Fetches a single active catalog row; inactive rows behave as missing. */
export async function findActiveCatalogCourse(
  userId: string,
  catalogCourseId: string,
): Promise<CourseCatalogItem | undefined> {
  void userId;

  const [row] = await db
    .select({
      id: courseCatalog.id,
      code: courseCatalog.code,
      name: courseCatalog.name,
      description: courseCatalog.description,
      credits: courseCatalog.credits,
      studyProgramId: courseCatalog.studyProgramId,
      studyProgramCode: studyPrograms.code,
      studyProgramName: studyPrograms.name,
    })
    .from(courseCatalog)
    .leftJoin(
      studyPrograms,
      eq(courseCatalog.studyProgramId, studyPrograms.id),
    )
    .where(
      and(
        eq(courseCatalog.id, catalogCourseId),
        eq(courseCatalog.isActive, true),
      ),
    )
    .limit(1);
  return row;
}

export type OwnedCourse = typeof courses.$inferSelect;

export async function listOwnedTermCourses(
  userId: string,
  termId: string,
): Promise<OwnedCourse[]> {
  return db
    .select()
    .from(courses)
    .where(and(eq(courses.userId, userId), eq(courses.termId, termId)))
    .orderBy(courses.position, courses.name);
}

export async function listTermCourseCounts(
  userId: string,
): Promise<Array<{ termId: string; count: number }>> {
  const rows = await db
    .select({
      termId: courses.termId,
      count: sql<number>`count(*)`,
    })
    .from(courses)
    .where(eq(courses.userId, userId))
    .groupBy(courses.termId);
  return rows
    .filter((row) => row.termId !== null)
    .map((row) => ({
      termId: row.termId as string,
      count: Number(row.count),
    }));
}
