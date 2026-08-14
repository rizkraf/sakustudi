import { describe, expect, it } from "vitest";

import {
  deriveActivityState,
  formatDeadline,
  parseDeadlineInput,
  toDeadlineInputValue,
} from "~/lib/time/deadlines";
import {
  ACTIVITY_STATUS_TRANSITIONS,
  canTransitionStatus,
  createActivitySchema,
  updateActivitySchema,
} from "~/modules/activities/activities.schema";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("deadline input conversion (Asia/Jakarta)", () => {
  it("stores a date-only deadline as 23:59 WIB in UTC", () => {
    expect(parseDeadlineInput("2026-09-01").toISOString()).toBe(
      "2026-09-01T16:59:59.000Z",
    );
  });

  it("converts a datetime input as WIB wall clock", () => {
    expect(parseDeadlineInput("2026-09-01T14:30").toISOString()).toBe(
      "2026-09-01T07:30:00.000Z",
    );
  });

  it("converts a datetime input with seconds as WIB wall clock", () => {
    expect(parseDeadlineInput("2026-09-01T08:00:15").toISOString()).toBe(
      "2026-09-01T01:00:15.000Z",
    );
  });

  it("round-trips a stored end-of-day deadline to the same calendar date", () => {
    const stored = parseDeadlineInput("2026-09-01");
    expect(toDeadlineInputValue(stored)).toBe("2026-09-01");
  });

  it("rejects malformed input", () => {
    expect(() => parseDeadlineInput("2026-13-40")).toThrow();
    expect(() => parseDeadlineInput("next week")).toThrow();
    expect(() => parseDeadlineInput("")).toThrow();
  });

  it("formats end-of-day deadlines as a date and timed ones with a time", () => {
    expect(formatDeadline(parseDeadlineInput("2026-09-01"))).toBe("Sep 1, 2026");
    expect(formatDeadline(parseDeadlineInput("2026-09-01T14:30"))).toMatch(
      /Sep 1, 2026, 14:30/,
    );
  });
});

describe("deriveActivityState", () => {
  const now = new Date("2026-08-14T00:00:00.000Z");
  const past = new Date("2026-08-01T00:00:00.000Z");
  const future = new Date("2026-09-01T00:00:00.000Z");

  it("reports not_started for a pending activity with a future deadline", () => {
    expect(deriveActivityState({ status: "pending", dueDate: future }, now)).toBe(
      "not_started",
    );
  });

  it("reports not_started when there is no deadline", () => {
    expect(deriveActivityState({ status: "pending", dueDate: null }, now)).toBe(
      "not_started",
    );
  });

  it("reports in_progress regardless of deadline", () => {
    expect(deriveActivityState({ status: "in_progress", dueDate: future }, now)).toBe(
      "in_progress",
    );
  });

  it("derives overdue only when the deadline is past and not completed", () => {
    expect(deriveActivityState({ status: "pending", dueDate: past }, now)).toBe(
      "overdue",
    );
    expect(deriveActivityState({ status: "in_progress", dueDate: past }, now)).toBe(
      "overdue",
    );
  });

  it("never reports overdue for a completed activity", () => {
    expect(deriveActivityState({ status: "completed", dueDate: past }, now)).toBe(
      "completed",
    );
  });
});

describe("activity status transitions", () => {
  it("permits only the forward chain and reopening", () => {
    expect(ACTIVITY_STATUS_TRANSITIONS).toEqual({
      pending: ["in_progress", "completed"],
      in_progress: ["completed"],
      completed: ["pending", "in_progress"],
    });
  });

  it("accepts forward transitions and same-status no-ops", () => {
    expect(canTransitionStatus("pending", "in_progress")).toBe(true);
    expect(canTransitionStatus("pending", "completed")).toBe(true);
    expect(canTransitionStatus("in_progress", "completed")).toBe(true);
    expect(canTransitionStatus("pending", "pending")).toBe(true);
    expect(canTransitionStatus("completed", "completed")).toBe(true);
  });

  it("rejects reopening of in-progress work and backwards jumps", () => {
    expect(canTransitionStatus("in_progress", "pending")).toBe(false);
    expect(canTransitionStatus("completed", "pending")).toBe(true);
    expect(canTransitionStatus("completed", "in_progress")).toBe(true);
  });
});

describe("activity schema validation", () => {
  const valid = {
    title: "Tugas 1",
    courseId: UUID,
    type: "assignment",
    deadline: "2026-09-01",
  };

  it("accepts a complete create input and strips empty details", () => {
    const parsed = createActivitySchema.parse({
      ...valid,
      details: "   ",
    });
    expect(parsed).toMatchObject(valid);
    expect(parsed.details).toBeUndefined();
  });

  it("keeps non-empty details", () => {
    const parsed = createActivitySchema.parse({
      ...valid,
      details: "Read chapter 3",
    });
    expect(parsed.details).toBe("Read chapter 3");
  });

  it("requires title, course, type, and deadline", () => {
    const result = createActivitySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((issue) => issue.path[0]));
      expect(fields).toEqual(new Set(["title", "courseId", "type", "deadline"]));
    }
  });

  it("rejects blank titles and malformed deadlines", () => {
    expect(createActivitySchema.safeParse({ ...valid, title: "   " }).success).toBe(
      false,
    );
    expect(
      createActivitySchema.safeParse({ ...valid, deadline: "tomorrow" }).success,
    ).toBe(false);
  });

  it("allows partial updates", () => {
    const parsed = updateActivitySchema.parse({ title: "Renamed" });
    expect(parsed).toEqual({ title: "Renamed" });
    expect(updateActivitySchema.safeParse({}).success).toBe(true);
  });
});
