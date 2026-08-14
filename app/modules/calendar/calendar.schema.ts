import { z } from "zod";

import { fromZonedTime } from "date-fns-tz";
import { DEADLINE_TIME_ZONE } from "~/lib/time/deadlines";

export const CALENDAR_EVENT_TYPES = [
  "class",
  "assignment",
  "exam",
  "reminder",
  "other",
] as const;

export const CALENDAR_EVENT_TYPE_LABELS: Record<
  (typeof CALENDAR_EVENT_TYPES)[number],
  string
> = {
  class: "Class",
  assignment: "Assignment",
  exam: "Exam",
  reminder: "Reminder",
  other: "Other",
};

const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Calendar event datetimes are naive YYYY-MM-DDTHH:mm values interpreted in
 * Asia/Jakarta (same convention as activity deadlines), converted to UTC for
 * storage.
 */
function parseEventDatetime(value: string): Date {
  const normalized = value.trim();
  if (!DATETIME_PATTERN.test(normalized)) {
    throw new Error("Time must be a date and time (YYYY-MM-DDTHH:mm).");
  }
  const date = fromZonedTime(`${normalized}:00`, DEADLINE_TIME_ZONE);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Time is not a valid calendar datetime.");
  }
  return date;
}

export const createCalendarEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required.")
      .max(200, "Title must be 200 characters or fewer."),
    startsAt: z.string().trim().min(1, "Start time is required."),
    endsAt: z.string().trim().min(1, "End time is required."),
    eventType: z.enum(CALENDAR_EVENT_TYPES, {
      message: "Select a type.",
    }),
    location: z
      .string()
      .trim()
      .max(200, "Location must be 200 characters or fewer.")
      .optional()
      .transform((value) => (value === "" ? null : value ?? null)),
    description: z
      .string()
      .trim()
      .max(5000, "Description must be 5000 characters or fewer.")
      .optional()
      .transform((value) => (value === "" ? null : value ?? null)),
  })
  .superRefine((value, ctx) => {
    let starts: Date;
    let ends: Date;
    try {
      starts = parseEventDatetime(value.startsAt);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: (error as Error).message,
      });
      return;
    }
    try {
      ends = parseEventDatetime(value.endsAt);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: (error as Error).message,
      });
      return;
    }
    if (ends < starts) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after the start time.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    startsAt: parseEventDatetime(value.startsAt),
    endsAt: parseEventDatetime(value.endsAt),
  }));

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const deleteCalendarEventSchema = z.object({
  eventId: z.string().uuid("Event is not valid."),
});

export type DeleteCalendarEventInput = z.infer<typeof deleteCalendarEventSchema>;
