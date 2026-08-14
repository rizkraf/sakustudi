import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Activity deadlines are interpreted in Asia/Jakarta (WIB, fixed UTC+7):
 * a date-only input means the end of that day, 23:59 WIB, stored as UTC.
 * This file owns every conversion between user-facing deadline input and
 * the UTC timestamps stored in `activities.due_date`.
 */
export const DEADLINE_TIME_ZONE = "Asia/Jakarta";
export const DEADLINE_END_OF_DAY = "T23:59:59";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Accepts a date-only input (YYYY-MM-DD, stored as 23:59 in Asia/Jakarta)
 * or a datetime input (YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss, interpreted
 * in Asia/Jakarta) and returns the equivalent UTC instant.
 *
 * Note: fromZonedTime is called with a naive string, not a Date, because
 * Date inputs are interpreted from the server's own clock, which is not the
 * Jakarta wall clock.
 */
export function parseDeadlineInput(value: string): Date {
  const normalized = value.trim();
  if (DATE_ONLY_PATTERN.test(normalized)) {
    return validUtcOrThrow(
      fromZonedTime(`${normalized}${DEADLINE_END_OF_DAY}`, DEADLINE_TIME_ZONE),
    );
  }
  if (DATE_TIME_PATTERN.test(normalized)) {
    const withSeconds = /:\d{2}$/.test(normalized) ? normalized : `${normalized}:00`;
    return validUtcOrThrow(
      fromZonedTime(withSeconds, DEADLINE_TIME_ZONE),
    );
  }
  throw new Error(
    "Deadline must be a date (YYYY-MM-DD) or a date and time (YYYY-MM-DDTHH:mm).",
  );
}

function validUtcOrThrow(date: Date): Date {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Deadline is not a valid calendar date.");
  }
  return date;
}

/**
 * Pattern match is not enough: "2026-13-40" fits the shape but is not a
 * calendar date, so the calendar check lives here and feeds schema
 * validation, keeping every path through parseDeadlineInput safe.
 */
export function isValidDeadlineInput(value: string): boolean {
  const trimmed = value.trim();
  if (!(DATE_ONLY_PATTERN.test(trimmed) || DATE_TIME_PATTERN.test(trimmed))) {
    return false;
  }
  try {
    return !Number.isNaN(parseDeadlineInput(trimmed).getTime());
  } catch {
    return false;
  }
}

/**
 * The user-facing date input value (YYYY-MM-DD) for a stored UTC deadline,
 * shown as the date part in Asia/Jakarta so the form round-trips exactly:
 * 23:59 WIB deadlines edit back to the same calendar date.
 */
export function toDeadlineInputValue(deadline: Date): string {
  const zoned = toZonedTime(deadline, DEADLINE_TIME_ZONE);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a stored deadline for display. Deadlines at 23:59 WIB (the
 * date-only convention) render as a calendar date; deadlines with a real
 * time render date and time, both in Asia/Jakarta.
 */
export function formatDeadline(deadline: Date): string {
  const zoned = toZonedTime(deadline, DEADLINE_TIME_ZONE);
  const date = zoned.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = zoned.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (time === "23:59") {
    return date;
  }
  return `${date}, ${time}`;
}

export type ActivityStatusValue = "pending" | "in_progress" | "completed";
export type ActivityState =
  | "not_started"
  | "in_progress"
  | "completed"
  | "overdue";

/**
 * Derives the display state of an activity from its persisted status and
 * deadline. Overdue is never persisted: it exists only when the deadline is
 * past and the activity is not completed. A "pending" row reads as
 * "not_started" until it is overdue or in progress.
 */
export function deriveActivityState(
  activity: { status: ActivityStatusValue; dueDate: Date | null },
  now: Date,
): ActivityState {
  if (activity.status === "completed") return "completed";
  if (activity.dueDate !== null && activity.dueDate < now) return "overdue";
  if (activity.status === "in_progress") return "in_progress";
  return "not_started";
}
