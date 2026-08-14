import { describe, expect, it } from "vitest";

import { calculateCourseProgress } from "~/lib/time/progress";

describe("calculateCourseProgress", () => {
  it("is 0% when there are no activities", () => {
    expect(calculateCourseProgress(0, 0)).toBe(0);
  });

  it("is 0% when nothing is completed", () => {
    expect(calculateCourseProgress(0, 5)).toBe(0);
  });

  it("is 100% when everything is completed", () => {
    expect(calculateCourseProgress(5, 5)).toBe(100);
  });

  it("computes completed / total as a rounded percentage", () => {
    expect(calculateCourseProgress(2, 4)).toBe(50);
    expect(calculateCourseProgress(1, 3)).toBe(33);
    expect(calculateCourseProgress(2, 3)).toBe(67);
  });

  it("clamps out-of-range ratios", () => {
    expect(calculateCourseProgress(6, 5)).toBe(100);
    expect(calculateCourseProgress(-1, 5)).toBe(0);
  });
});
