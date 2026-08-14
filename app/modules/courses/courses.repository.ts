import { and, asc, count, eq, sql } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { activities, courses } from "~/lib/db/schema";
import { listActivitiesForCourse } from "~/modules/activities/activities.repository";

const db = getDb();

export type CourseRow = typeof courses.$inferSelect;

export async function findOwnedCourse(
  userId: string,
  courseId: string,
): Promise<CourseRow | undefined> {
  const [row] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.userId, userId), eq(courses.id, courseId)))
    .limit(1);
  return row;
}

export async function listOwnedCourses(userId: string): Promise<CourseRow[]> {
  return db
    .select()
    .from(courses)
    .where(eq(courses.userId, userId))
    .orderBy(asc(courses.position), asc(courses.name));
}

export async function countTermCourses(
  userId: string,
  termId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(courses)
    .where(and(eq(courses.userId, userId), eq(courses.termId, termId)));
  return Number(row.value);
}

export type CourseActivityProgress = {
  completedCount: number;
  totalCount: number;
};

export async function selectCourseActivityProgress(
  userId: string,
  courseId: string,
): Promise<CourseActivityProgress> {
  const [row] = await db
    .select({
      completedCount: sql<number>`count(*) filter (where ${activities.status} = 'completed')`,
      totalCount: count(),
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.courseId, courseId)));
  return {
    completedCount: Number(row.completedCount),
    totalCount: Number(row.totalCount),
  };
}

export type CourseWithProgress = {
  course: CourseRow;
  completedCount: number;
  totalCount: number;
};

/**
 * All courses of a term joined with per-course activity counts in one
 * bounded query, so the dashboard and course pages never N+1.
 */
export async function listTermCoursesWithProgress(
  userId: string,
  termId: string,
): Promise<CourseWithProgress[]> {
  const progress = db
    .select({
      courseId: activities.courseId,
      completedCount: sql<number>`count(*) filter (where ${activities.status} = 'completed')`.as(
        "completed_count",
      ),
      totalCount: count().as("total_count"),
    })
    .from(activities)
    .where(eq(activities.userId, userId))
    .groupBy(activities.courseId)
    .as("activity_progress");

  const rows = await db
    .select({
      course: courses,
      completedCount: sql<number>`coalesce(${progress.completedCount}, 0)`,
      totalCount: sql<number>`coalesce(${progress.totalCount}, 0)`,
    })
    .from(courses)
    .leftJoin(progress, eq(courses.id, progress.courseId))
    .where(and(eq(courses.userId, userId), eq(courses.termId, termId)))
    .orderBy(asc(courses.position), asc(courses.name));

  return rows.map((row) => ({
    course: row.course,
    completedCount: Number(row.completedCount),
    totalCount: Number(row.totalCount),
  }));
}

export { listActivitiesForCourse as listCourseActivities };
