import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { REMINDER_HOUR, REMINDER_MINUTE, REMINDER_OFFSET_DAYS } from "~/lib/queue/names";

export { REMINDER_OFFSET_DAYS, REMINDER_HOUR, REMINDER_MINUTE };

/**
 * Computes the UTC instants at which reminders for a deadline should fire:
 * 3 days and 1 day before the deadline, at 09:00 in the given timezone,
 * converted back to UTC. Times already in the past are skipped, so at most
 * two timestamps come back (earliest first), and an empty array means every
 * scheduled time has already passed.
 *
 * The conversion is calendar-based: the deadline's date in the timezone is
 * shifted by whole days, then the 09:00 wall-clock time is attached. Asia/
 * Jakarta has no DST, but the date-fns-tz round trip keeps the math correct
 * for any zone, including zones with transitions.
 *
 * @param timezone IANA name, e.g. "Asia/Jakarta".
 * @param now      Injection point for tests; defaults to the real clock.
 */
export function calculateReminderTimes(
  deadlineUtc: Date,
  timezone: string,
  now: Date = new Date(),
): Date[] {
  if (Number.isNaN(deadlineUtc.getTime())) {
    return [];
  }
  // toZonedTime returns a Date whose UTC fields carry the wall-clock values
  // in `timezone`; read them with the UTC getters regardless of the server's
  // own timezone.
  const deadlineLocal = toZonedTime(deadlineUtc, timezone);
  const wallYear = deadlineLocal.getUTCFullYear();
  const wallMonth = deadlineLocal.getUTCMonth();
  const wallDay = deadlineLocal.getUTCDate();

  const times: Date[] = [];
  for (const offsetDays of REMINDER_OFFSET_DAYS) {
    // Date.UTC normalizes month/day overflow (e.g. day 0 -> last day of the
    // previous month), so calendar-day subtraction is safe across month and
    // year boundaries. The naive wall-clock string is what makes the
    // conversion independent of the server's own timezone.
    const shifted = new Date(
      Date.UTC(wallYear, wallMonth, wallDay - offsetDays),
    );
    const naive = `${shifted.getUTCFullYear()}-${String(
      shifted.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(
      2,
      "0",
    )}T${String(REMINDER_HOUR).padStart(2, "0")}:${String(
      REMINDER_MINUTE,
    ).padStart(2, "0")}`;
    const zoned = fromZonedTime(naive, timezone);
    if (Number.isNaN(zoned.getTime())) {
      continue;
    }
    if (zoned.getTime() <= now.getTime()) {
      continue;
    }
    times.push(zoned);
  }

  return times;
}

/**
 * Message shown with a reminder, e.g. "Tugas 1 is due in 3 days." Computed
 * from the calendar-day difference between the reminder and the deadline in
 * the user's timezone.
 */
export function buildReminderMessage(
  activityTitle: string,
  remindAt: Date,
  deadlineUtc: Date,
  timezone: string,
): string {
  const remindLocal = toZonedTime(remindAt, timezone);
  const deadlineLocal = toZonedTime(deadlineUtc, timezone);
  const remindDay = Date.UTC(
    remindLocal.getUTCFullYear(),
    remindLocal.getUTCMonth(),
    remindLocal.getUTCDate(),
  );
  const deadlineDay = Date.UTC(
    deadlineLocal.getUTCFullYear(),
    deadlineLocal.getUTCMonth(),
    deadlineLocal.getUTCDate(),
  );
  const days = Math.round(
    (deadlineDay - remindDay) / (24 * 60 * 60 * 1000),
  );
  if (days <= 1) {
    return `${activityTitle} is due tomorrow.`;
  }
  return `${activityTitle} is due in ${days} days.`;
}
