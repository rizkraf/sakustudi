import { and, asc, count, eq, gte, lt, lte, ne } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { activities, courses } from "~/lib/db/schema";

const db = getDb();

export type ActivityRow = typeof activities.$inferSelect;
export type ActivityStatus = ActivityRow["status"];
export type ActivityType = ActivityRow["type"];

/**
 * An activity joined with its course's identity for list rendering, so
 * cards can show "Course Name · code" without a follow-up query per row.
 */
export type ActivityWithCourse = ActivityRow & {
  courseName: string | null;
  courseCode: string | null;
};

export type ActivityPage = {
  items: ActivityWithCourse[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ActivityInsert = {
  courseId: string;
  termId: string | null;
  title: string;
  type: ActivityType;
  dueDate: Date;
  details: string | null;
};

export type ActivityUpdate = {
  courseId?: string | null;
  termId?: string | null;
  title?: string;
  type?: ActivityType;
  dueDate?: Date | null;
  details?: string | null;
};

const activityWithCourse = {
  id: activities.id,
  userId: activities.userId,
  courseId: activities.courseId,
  termId: activities.termId,
  title: activities.title,
  type: activities.type,
  dueDate: activities.dueDate,
  status: activities.status,
  completedAt: activities.completedAt,
  details: activities.details,
  createdAt: activities.createdAt,
  updatedAt: activities.updatedAt,
  courseName: courses.name,
  courseCode: courses.code,
};

export async function findOwnedActivity(
  userId: string,
  activityId: string,
): Promise<ActivityRow | undefined> {
  const [row] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)))
    .limit(1);
  return row;
}

export async function insertActivity(
  userId: string,
  input: ActivityInsert,
): Promise<ActivityRow> {
  const [row] = await db
    .insert(activities)
    .values({
      userId,
      courseId: input.courseId,
      termId: input.termId,
      title: input.title,
      type: input.type,
      dueDate: input.dueDate,
      details: input.details,
    })
    .returning();
  return row;
}

export async function updateOwnedActivity(
  userId: string,
  activityId: string,
  input: ActivityUpdate,
): Promise<ActivityRow | undefined> {
  const [row] = await db
    .update(activities)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)))
    .returning();
  return row;
}

/**
 * Locks the activity row for update inside a transaction so concurrent
 * status changes serialize: the second writer sees the first writer's
 * committed status before validating its own transition.
 */
export async function lockOwnedActivity(
  userId: string,
  activityId: string,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<ActivityRow | undefined> {
  const [row] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)))
    .for("update")
    .limit(1);
  return row;
}

export async function saveActivityStatus(
  userId: string,
  activityId: string,
  status: ActivityStatus,
  completedAt: Date | null,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<ActivityRow> {
  const [row] = await tx
    .update(activities)
    .set({ status, completedAt, updatedAt: new Date() })
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)))
    .returning();
  if (!row) {
    throw new Error("Activity row disappeared during status update.");
  }
  return row;
}

export async function listActivityPage(
  userId: string,
  termId: string,
  page: number,
  pageSize: number,
): Promise<ActivityPage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const where = and(eq(activities.userId, userId), eq(activities.termId, termId));

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select(activityWithCourse)
      .from(activities)
      .leftJoin(courses, eq(activities.courseId, courses.id))
      .where(where)
      .orderBy(asc(activities.dueDate), asc(activities.createdAt))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    db
      .select({ value: count() })
      .from(activities)
      .where(where),
  ]);

  return {
    items: rows,
    total: Number(total),
    page: safePage,
    pageSize: safePageSize,
    pageCount: Math.max(1, Math.ceil(Number(total) / safePageSize)),
  };
}

export type DeadlineRange = { from: Date; to: Date };

/**
 * Non-completed activities with a deadline inside [from, to], nearest
 * deadline first. `limit` bounds the query so dashboard reads stay small.
 */
export async function listUpcomingActivities(
  userId: string,
  termId: string,
  range: DeadlineRange,
  limit = 5,
): Promise<ActivityWithCourse[]> {
  return db
    .select(activityWithCourse)
    .from(activities)
    .leftJoin(courses, eq(activities.courseId, courses.id))
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.termId, termId),
        gte(activities.dueDate, range.from),
        lte(activities.dueDate, range.to),
        ne(activities.status, "completed"),
      ),
    )
    .orderBy(asc(activities.dueDate), asc(activities.createdAt))
    .limit(limit);
}

/** Non-completed activities past their deadline, oldest first, bounded. */
export async function listOverdueActivities(
  userId: string,
  termId: string,
  now: Date,
  limit = 5,
): Promise<ActivityWithCourse[]> {
  return db
    .select(activityWithCourse)
    .from(activities)
    .leftJoin(courses, eq(activities.courseId, courses.id))
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.termId, termId),
        lt(activities.dueDate, now),
        ne(activities.status, "completed"),
      ),
    )
    .orderBy(asc(activities.dueDate))
    .limit(limit);
}

export async function listActivitiesForCourse(
  userId: string,
  courseId: string,
): Promise<ActivityWithCourse[]> {
  return db
    .select(activityWithCourse)
    .from(activities)
    .leftJoin(courses, eq(activities.courseId, courses.id))
    .where(and(eq(activities.userId, userId), eq(activities.courseId, courseId)))
    .orderBy(asc(activities.dueDate), asc(activities.createdAt));
}

export async function countTermActivities(
  userId: string,
  termId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.termId, termId)));
  return Number(row.value);
}
