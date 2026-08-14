import { and, asc, eq, gte, lte } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { activities, calendarEvents, courses } from "~/lib/db/schema";

const db = getDb();

export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type CalendarEventType = CalendarEventRow["eventType"];

export type CalendarEventInsert = {
  userId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  eventType: CalendarEventType;
  courseId: string | null;
  location: string | null;
  description: string | null;
};

export type CalendarEventUpdate = Partial<
  Pick<CalendarEventInsert, "title" | "startsAt" | "endsAt" | "eventType" | "courseId" | "location" | "description">
>;

export async function findOwnedCalendarEvent(
  userId: string,
  eventId: string,
): Promise<CalendarEventRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, eventId)))
    .limit(1);
  return row;
}

export async function insertCalendarEvent(
  input: CalendarEventInsert,
): Promise<CalendarEventRow> {
  const [row] = await db.insert(calendarEvents).values(input).returning();
  return row;
}

export async function updateOwnedCalendarEvent(
  userId: string,
  eventId: string,
  patch: CalendarEventUpdate,
): Promise<CalendarEventRow | undefined> {
  const [row] = await db
    .update(calendarEvents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, eventId)))
    .returning();
  return row;
}

export async function deleteOwnedCalendarEvent(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const rows = await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, eventId)))
    .returning({ id: calendarEvents.id });
  return rows.length > 0;
}

/** Manual calendar events inside [from, to), earliest first. */
export async function listCalendarEvents(
  userId: string,
  from: Date,
  to: Date,
): Promise<CalendarEventRow[]> {
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        lte(calendarEvents.startsAt, to),
        gte(calendarEvents.endsAt, from),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.endsAt));
}

/**
 * Activity deadlines inside [from, to) joined with their course name, for
 * the calendar projection. Deadlines are read straight from `activities`
 * (the source of truth) — never duplicated into mutable calendar rows.
 */
export type ActivityDeadlineProjection = {
  activityId: string;
  title: string;
  dueDate: Date;
  status: string;
  courseName: string | null;
};

export async function listActivityDeadlines(
  userId: string,
  from: Date,
  to: Date,
): Promise<ActivityDeadlineProjection[]> {
  const rows = await db
    .select({
      activityId: activities.id,
      title: activities.title,
      dueDate: activities.dueDate,
      status: activities.status,
      courseName: courses.name,
    })
    .from(activities)
    .leftJoin(courses, eq(activities.courseId, courses.id))
    .where(
      and(
        eq(activities.userId, userId),
        lte(activities.dueDate, to),
        gte(activities.dueDate, from),
      ),
    )
    .orderBy(asc(activities.dueDate));
  return rows
    .filter((row): row is typeof row & { dueDate: Date } => row.dueDate !== null)
    .map((row) => ({
      activityId: row.activityId,
      title: row.title,
      dueDate: row.dueDate,
      status: row.status,
      courseName: row.courseName,
    }));
}
