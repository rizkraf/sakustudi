import { calculateCourseProgress } from "~/lib/time/progress";
import { findActiveTerm } from "~/modules/academic-terms/terms.repository";
import type { AcademicTermRow } from "~/modules/academic-terms/terms.repository";
import {
  listOverdue,
  listUpcomingActivities,
  type ActivityWithCourse,
} from "~/modules/activities/activities.service";
import {
  listTermCoursesWithProgress,
  type CourseWithProgress,
} from "~/modules/courses/courses.repository";

/** Upcoming deadlines window: the next 7 days, matching reminder lookahead. */
export const UPCOMING_WINDOW_DAYS = 7;

export type DashboardCourse = {
  course: CourseWithProgress["course"];
  progress: number;
};

export type DashboardData = {
  activeTerm: AcademicTermRow | null;
  courseCount: number;
  courses: DashboardCourse[];
  upcomingActivities: ActivityWithCourse[];
  overdueActivities: ActivityWithCourse[];
  /** Server clock when the dashboard was read, for client-side derivation. */
  now: string;
};

/**
 * One bounded dashboard read: the active term, its course count and
 * per-course progress, the nearest upcoming deadlines, and overdue
 * activities. No active term yields an empty dashboard, not an error.
 */
export async function getDashboardData(userId: string): Promise<DashboardData> {
  const activeTerm = await findActiveTerm(userId);
  const now = new Date();

  if (!activeTerm) {
    return {
      activeTerm: null,
      courseCount: 0,
      courses: [],
      upcomingActivities: [],
      overdueActivities: [],
      now: now.toISOString(),
    };
  }

  const to = new Date(
    now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [courses, upcomingActivities, overdueActivities] = await Promise.all([
    listTermCoursesWithProgress(userId, activeTerm.id),
    listUpcomingActivities(userId, activeTerm.id, { from: now, to }),
    listOverdue(userId, activeTerm.id, now),
  ]);

  return {
    activeTerm,
    courseCount: courses.length,
    courses: courses.map(({ course, completedCount, totalCount }) => ({
      course,
      progress: calculateCourseProgress(completedCount, totalCount),
    })),
    upcomingActivities,
    overdueActivities,
    now: now.toISOString(),
  };
}
