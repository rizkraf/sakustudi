import { AppError } from "~/lib/errors/AppError";
import { getDb } from "~/lib/db/client";
import { parseDeadlineInput } from "~/lib/time/deadlines";
import { findOwnedCourse } from "~/modules/courses/courses.repository";
import { zodIssuesToFieldErrors } from "~/modules/shared/zod";
import {
  canTransitionStatus,
  createActivitySchema,
  setActivityStatusSchema,
  updateActivitySchema,
  type CreateActivityInput,
  type SetActivityStatusInput,
  type UpdateActivityInput,
} from "./activities.schema";
import {
  findOwnedActivity,
  insertActivity,
  listActivityPage,
  listOverdueActivities,
  listUpcomingActivities as selectUpcomingActivities,
  lockOwnedActivity,
  saveActivityStatus,
  updateOwnedActivity,
  type ActivityPage,
  type ActivityRow,
  type ActivityStatus,
  type ActivityWithCourse,
  type DeadlineRange,
} from "./activities.repository";

export type Activity = ActivityRow;

export {
  listActivityPage,
  type ActivityPage,
  type ActivityWithCourse,
  type DeadlineRange,
};

export { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from "./activities.schema";

/**
 * Creates an activity for the given user. The course must belong to the
 * user; the activity inherits the course's term so every activity is
 * reachable from its term without trusting a client-supplied termId.
 */
export async function createActivity(
  userId: string,
  input: CreateActivityInput,
): Promise<Activity> {
  const parsed = createActivitySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  const course = await findOwnedCourse(userId, parsed.data.courseId);
  if (!course) {
    throw new AppError("NOT_FOUND", "Course not found.");
  }

  return insertActivity(userId, {
    courseId: course.id,
    termId: course.termId,
    title: parsed.data.title,
    type: parsed.data.type,
    dueDate: parseDeadlineInput(parsed.data.deadline),
    details: parsed.data.details ?? null,
  });
}

/**
 * Updates the editable fields of an owned activity. Status is intentionally
 * out of scope: it has its own command with transition rules. Changing the
 * course moves the activity to that course's term.
 */
export async function updateActivity(
  userId: string,
  activityId: string,
  input: UpdateActivityInput,
): Promise<Activity> {
  const parsed = updateActivitySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  const existing = await findOwnedActivity(userId, activityId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  let courseId = existing.courseId;
  let termId = existing.termId;
  if (parsed.data.courseId !== undefined && parsed.data.courseId !== existing.courseId) {
    const course = await findOwnedCourse(userId, parsed.data.courseId);
    if (!course) {
      throw new AppError("NOT_FOUND", "Course not found.");
    }
    courseId = course.id;
    termId = course.termId;
  }

  const updated = await updateOwnedActivity(userId, activityId, {
    title: parsed.data.title ?? existing.title,
    type: parsed.data.type ?? existing.type,
    dueDate:
      parsed.data.deadline !== undefined
        ? parseDeadlineInput(parsed.data.deadline)
        : existing.dueDate,
    details:
      parsed.data.details !== undefined
        ? (parsed.data.details ?? null)
        : existing.details,
    courseId,
    termId,
  });
  if (!updated) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }
  return updated;
}

/**
 * Applies a status change with the transition rules of the domain:
 * pending -> in_progress -> completed (completion timestamp set only on
 * completion), and reopening a completed activity back to pending or
 * in_progress clears the completion timestamp. Overdue is never persisted.
 *
 * The row is locked for update so concurrent status changes serialize
 * instead of racing through the transition check.
 */
export async function setActivityStatus(
  userId: string,
  activityId: string,
  status: ActivityStatus,
): Promise<Activity> {
  const parsed = setActivityStatusSchema.safeParse({
    activityId,
    status,
  });
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const row = await lockOwnedActivity(userId, activityId, tx);
    if (!row) {
      throw new AppError("NOT_FOUND", "Activity not found.");
    }
    if (row.status === status) {
      return row;
    }
    if (!canTransitionStatus(row.status, status)) {
      throw new AppError(
        "VALIDATION_FAILED",
        `Cannot change the activity from ${row.status} to ${status}.`,
        {
          fieldErrors: {
            status: [
              `Cannot change the activity from ${row.status} to ${status}.`,
            ],
          },
        },
      );
    }
    return saveActivityStatus(
      userId,
      activityId,
      status,
      status === "completed" ? new Date() : null,
      tx,
    );
  });
}

export async function setActivityStatusFromInput(
  userId: string,
  input: SetActivityStatusInput,
): Promise<Activity> {
  const parsed = setActivityStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }
  return setActivityStatus(userId, parsed.data.activityId, parsed.data.status);
}

export async function getActivity(
  userId: string,
  activityId: string,
): Promise<Activity> {
  const row = await findOwnedActivity(userId, activityId);
  if (!row) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }
  return row;
}

/** Upcoming deadlines: non-completed activities due inside the range. */
export function listUpcomingActivities(
  userId: string,
  termId: string,
  range: DeadlineRange,
  limit?: number,
): Promise<ActivityWithCourse[]> {
  return selectUpcomingActivities(userId, termId, range, limit);
}

/** Overdue: non-completed activities with a deadline before `now`. */
export function listOverdue(
  userId: string,
  termId: string,
  now: Date,
  limit?: number,
): Promise<ActivityWithCourse[]> {
  return listOverdueActivities(userId, termId, now, limit);
}
