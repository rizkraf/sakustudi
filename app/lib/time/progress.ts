/**
 * Course progress is completed activities divided by total activities, as a
 * percentage between 0 and 100. A course with no activities has zero percent
 * progress by definition. Results are rounded to the nearest whole percent
 * for stable display and assertions.
 */
export function calculateCourseProgress(
  completedCount: number,
  totalCount: number,
): number {
  if (totalCount <= 0) return 0;
  const ratio = completedCount / totalCount;
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}
