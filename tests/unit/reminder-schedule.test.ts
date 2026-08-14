import { describe, expect, it } from "vitest";

import {
  buildReminderMessage,
  calculateReminderTimes,
  REMINDER_OFFSET_DAYS,
} from "~/lib/time/reminders";
import { REMINDER_HOUR, REMINDER_MINUTE } from "~/lib/queue/names";

describe("calculateReminderTimes", () => {
  const JAKARTA = "Asia/Jakarta";
  // 2026-10-15 23:59:59 WIB == 2026-10-15T16:59:59Z (date-only deadline).
  const deadline = new Date("2026-10-15T16:59:59.000Z");
  // Early enough that no test deadline's reminders are in the past.
  const fixedNow = new Date("2025-12-01T00:00:00.000Z");

  it("returns the 3-day and 1-day 09:00 WIB reminders, earliest first", () => {
    const times = calculateReminderTimes(deadline, JAKARTA, fixedNow);
    expect(times).toHaveLength(2);
    expect(times[0].toISOString()).toBe("2026-10-12T02:00:00.000Z");
    expect(times[1].toISOString()).toBe("2026-10-14T02:00:00.000Z");
  });

  it("keeps Jakarta fixed at UTC+7 (no DST shift across a would-be transition)", () => {
    // March 2026: many zones switch to DST; Jakarta must not move.
    const marchDeadline = new Date("2026-03-30T16:59:59.000Z");
    const times = calculateReminderTimes(marchDeadline, JAKARTA, fixedNow);
    expect(times).toHaveLength(2);
    expect(times[0].toISOString()).toBe("2026-03-27T02:00:00.000Z");
    expect(times[1].toISOString()).toBe("2026-03-29T02:00:00.000Z");
  });

  it("handles calendar-day subtraction across month and year boundaries", () => {
    const janDeadline = new Date("2026-01-02T16:59:59.000Z");
    const times = calculateReminderTimes(janDeadline, JAKARTA, fixedNow);
    expect(times).toHaveLength(2);
    // 3 days before 2026-01-02 lands in December 2025.
    expect(times[0].toISOString()).toBe("2025-12-30T02:00:00.000Z");
    expect(times[1].toISOString()).toBe("2026-01-01T02:00:00.000Z");
  });

  it("maps 09:00 wall time correctly on a DST transition day in another zone", () => {
    // Europe/Berlin: DST starts 2026-03-29 (02:00 CET -> 03:00 CEST).
    // 1-day reminder lands exactly on the transition day: 09:00 CEST == 07:00Z.
    const berlinDeadline = new Date("2026-03-30T18:00:00.000Z");
    const times = calculateReminderTimes(berlinDeadline, "Europe/Berlin", fixedNow);
    expect(times[0].toISOString()).toBe("2026-03-27T08:00:00.000Z");
    expect(times[1].toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });

  it("skips reminder times already in the past", () => {
    const midRun = new Date("2026-10-13T00:00:00.000Z"); // after 3-day, before 1-day
    const times = calculateReminderTimes(deadline, JAKARTA, midRun);
    expect(times).toHaveLength(1);
    expect(times[0].toISOString()).toBe("2026-10-14T02:00:00.000Z");
  });

  it("returns an empty array when every reminder time has passed", () => {
    const lateNow = new Date("2026-10-15T00:00:00.000Z");
    expect(calculateReminderTimes(deadline, JAKARTA, lateNow)).toEqual([]);
  });

  it("returns an empty array for an invalid deadline", () => {
    expect(
      calculateReminderTimes(new Date("not-a-date"), JAKARTA, fixedNow),
    ).toEqual([]);
  });

  it("keeps 09:00 in the zone wall clock for a deadline with a real time", () => {
    const timed = new Date("2026-10-15T08:30:00.000Z"); // 15:30 WIB
    const times = calculateReminderTimes(timed, JAKARTA, fixedNow);
    expect(times).toHaveLength(2);
    expect(times[0].toISOString()).toBe("2026-10-12T02:00:00.000Z");
    expect(times[1].toISOString()).toBe("2026-10-14T02:00:00.000Z");
  });

  it("schedule offsets are the configured 3-day/1-day pair at 09:00", () => {
    expect(REMINDER_OFFSET_DAYS).toEqual([3, 1]);
    expect(REMINDER_HOUR).toBe(9);
    expect(REMINDER_MINUTE).toBe(0);
  });
});

describe("buildReminderMessage", () => {
  const JAKARTA = "Asia/Jakarta";

  it("describes the 3-day reminder", () => {
    const message = buildReminderMessage(
      "Tugas 1",
      new Date("2026-10-12T02:00:00.000Z"),
      new Date("2026-10-15T16:59:59.000Z"),
      JAKARTA,
    );
    expect(message).toBe("Tugas 1 is due in 3 days.");
  });

  it("describes the 1-day reminder as tomorrow", () => {
    const message = buildReminderMessage(
      "Tugas 1",
      new Date("2026-10-14T02:00:00.000Z"),
      new Date("2026-10-15T16:59:59.000Z"),
      JAKARTA,
    );
    expect(message).toBe("Tugas 1 is due tomorrow.");
  });
});
