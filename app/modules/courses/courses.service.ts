import { AppError } from "~/lib/errors/AppError";
import { calculateCourseProgress } from "~/lib/time/progress";
import {
  findOwnedCourse,
  listCourseActivities,
  selectCourseActivityProgress,
  type CourseRow,
} from "./courses.repository";
import type { ActivityWithCourse } from "~/modules/activities/activities.repository";

export type CourseDetail = {
  course: CourseRow;
  completedCount: number;
  totalCount: number;
  progress: number;
  activities: ActivityWithCourse[];
};

/**
 * Course detail for the authenticated owner: identity, progress (completed
 * activities / total activities, 0% when empty), and its activity list.
 */
export async function getCourseDetail(
  userId: string,
  courseId: string,
): Promise<CourseDetail> {
  const course = await findOwnedCourse(userId, courseId);
  if (!course) {
    throw new AppError("NOT_FOUND", "Course not found.");
  }

  const [progress, activities] = await Promise.all([
    selectCourseActivityProgress(userId, courseId),
    listCourseActivities(userId, courseId),
  ]);

  return {
    course,
    completedCount: progress.completedCount,
    totalCount: progress.totalCount,
    progress: calculateCourseProgress(
      progress.completedCount,
      progress.totalCount,
    ),
    activities,
  };
}

export type { CourseRow };
