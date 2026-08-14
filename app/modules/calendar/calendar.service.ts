import { AppError } from "~/lib/errors/AppError";
import { zodIssuesToFieldErrors } from "~/modules/shared/zod";
import {
  createCalendarEventSchema,
  deleteCalendarEventSchema,
  type CreateCalendarEventInput,
  type DeleteCalendarEventInput,
} from "./calendar.schema";
import {
  deleteOwnedCalendarEvent,
  findOwnedCalendarEvent,
  insertCalendarEvent,
  listActivityDeadlines,
  listCalendarEvents,
  updateOwnedCalendarEvent,
  type ActivityDeadlineProjection,
  type CalendarEventRow,
  type CalendarEventUpdate,
} from "./calendar.repository";

export type {
  CalendarEventRow,
  ActivityDeadlineProjection,
};

export type CalendarDay = {
  date: string;
  events: CalendarEventRow[];
  deadlines: ActivityDeadlineProjection[];
};

/**
 * The calendar page data for a month window: manual events plus projected
 * activity deadlines, grouped by calendar day.
 */
export async function getCalendarData(
  userId: string,
  from: Date,
  to: Date,
): Promise<CalendarDay[]> {
  const [events, deadlines] = await Promise.all([
    listCalendarEvents(userId, from, to),
    listActivityDeadlines(userId, from, to),
  ]);

  const byDay = new Map<string, CalendarDay>();
  const bucket = (dayKey: string): CalendarDay => {
    const existing = byDay.get(dayKey);
    if (existing) return existing;
    const created: CalendarDay = { date: dayKey, events: [], deadlines: [] };
    byDay.set(dayKey, created);
    return created;
  };

  for (const event of events) {
    bucket(toDayKey(event.startsAt)).events.push(event);
  }
  for (const deadline of deadlines) {
    bucket(toDayKey(deadline.dueDate)).deadlines.push(deadline);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function createCalendarEvent(
  userId: string,
  input: CreateCalendarEventInput,
): Promise<CalendarEventRow> {
  const parsed = createCalendarEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }
  return insertCalendarEvent({
    userId,
    title: parsed.data.title,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    eventType: parsed.data.eventType,
    courseId: null,
    location: parsed.data.location,
    description: parsed.data.description,
  });
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  patch: CalendarEventUpdate,
): Promise<CalendarEventRow> {
  const existing = await findOwnedCalendarEvent(userId, eventId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Calendar event not found.");
  }
  const updated = await updateOwnedCalendarEvent(userId, eventId, patch);
  if (!updated) {
    throw new AppError("NOT_FOUND", "Calendar event not found.");
  }
  return updated;
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const deleted = await deleteOwnedCalendarEvent(userId, eventId);
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Calendar event not found.");
  }
}

export async function deleteCalendarEventFromInput(
  userId: string,
  input: DeleteCalendarEventInput,
): Promise<void> {
  const parsed = deleteCalendarEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }
  await deleteCalendarEvent(userId, parsed.data.eventId);
}
