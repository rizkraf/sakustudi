import { AppError } from "~/lib/errors/AppError";
import { getDb } from "~/lib/db/client";
import { parseDeadlineInput } from "~/lib/time/deadlines";
import { findOwnedCourse } from "~/modules/courses/courses.repository";
import { insertOutboxEvent } from "~/modules/outbox/outbox.repository";
import { getReminderEmailEnabled } from "~/modules/reminders/reminders.repository";
import {
  cancelReminderScheduleInTx,
  createReminderScheduleInTx,
  updateReminderTitles,
  type ReminderScheduleActivity,
} from "~/modules/reminders/reminders.service";
import { zodIssuesToFieldErrors } from "~/modules/shared/zod";
import { trackEvent } from "~/modules/analytics/analytics.service";
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

function toScheduleActivity(activity: ActivityRow): ReminderScheduleActivity {
  return {
    id: activity.id,
    userId: activity.userId,
    title: activity.title,
    dueDate: activity.dueDate,
    status: activity.status,
  };
}

/**
 * Creates an activity for the given user. The course must belong to the
 * user; the activity inherits the course's term so every activity is
 * reachable from its term without trusting a client-supplied termId.
 *
 * The activity row, its reminder schedule, and the outbox event are written
 * in one PostgreSQL transaction. Redis is never touched inside the
 * transaction: a background publisher enqueues the delivery jobs only after
 * the commit is durable.
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

  const db = getDb();
  let activity: Activity;
  let reminderChannels: string[] = [];
  await db.transaction(async (tx) => {
    activity = await insertActivity(
      userId,
      {
        courseId: course.id,
        termId: course.termId,
        title: parsed.data.title,
        type: parsed.data.type,
        dueDate: parseDeadlineInput(parsed.data.deadline),
        details: parsed.data.details ?? null,
        link: parsed.data.link ?? null,
      },
      tx,
    );
    const emailEnabled = await getReminderEmailEnabled(tx, userId);
    const reminders = await createReminderScheduleInTx(
      tx,
      userId,
      toScheduleActivity(activity),
      emailEnabled,
    );
    reminderChannels = [...new Set(reminders.map((r) => r.channel))];
    await insertOutboxEvent(tx, {
      userId,
      eventType: "activity.created",
      eventKey: `activity.created:${activity.id}:${crypto.randomUUID()}`,
      payload: { activityId: activity.id },
    });
  });

  await trackEvent(userId, "activity_created", { type: activity!.type });
  if (reminderChannels.length > 0) {
    await trackEvent(userId, "reminder_created", { channels: reminderChannels });
  }
  return activity!;
}

/**
 * Updates the editable fields of an owned activity. Status is intentionally
 * out of scope: it has its own command with transition rules. Changing the
 * course moves the activity to that course's term.
 *
 * A deadline change reschedules the reminders (old schedule cancelled, new
 * rows with a bumped deadline version) and writes an outbox event; all of it
 * happens in one transaction.
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

  const newDueDate =
    parsed.data.deadline !== undefined
      ? parseDeadlineInput(parsed.data.deadline)
      : existing.dueDate;
  const deadlineChanged =
    newDueDate !== null &&
    (existing.dueDate === null ||
      newDueDate.getTime() !== existing.dueDate.getTime());

  const db = getDb();
  return db.transaction(async (tx) => {
    const updated = await updateOwnedActivity(
      userId,
      activityId,
      {
        title: parsed.data.title ?? existing.title,
        type: parsed.data.type ?? existing.type,
        dueDate: newDueDate,
        details:
          parsed.data.details !== undefined
            ? (parsed.data.details ?? null)
            : existing.details,
        link:
          parsed.data.link !== undefined ? (parsed.data.link ?? null) : existing.link,
        courseId,
        termId,
      },
      tx,
    );
    if (!updated) {
      throw new AppError("NOT_FOUND", "Activity not found.");
    }

    if (deadlineChanged) {
      await cancelReminderScheduleInTx(tx, activityId);
      const emailEnabled = await getReminderEmailEnabled(tx, userId);
      await createReminderScheduleInTx(
        tx,
        userId,
        toScheduleActivity(updated),
        emailEnabled,
      );
      await insertOutboxEvent(tx, {
        userId,
        eventType: "activity.updated",
        eventKey: `activity.updated:${activityId}:${crypto.randomUUID()}`,
        payload: { activityId },
      });
    } else if (parsed.data.title !== undefined) {
      // Title-only change: refresh the reminder snapshot, nothing to enqueue.
      await updateReminderTitles(tx, activityId, updated.title);
    }
    return updated;
  });
}

/**
 * Applies a status change with the transition rules of the domain:
 * pending -> in_progress -> completed (completion timestamp set only on
 * completion), and reopening a completed activity back to pending or
 * in_progress clears the completion timestamp. Overdue is never persisted.
 *
 * The row is locked for update so concurrent status changes serialize
 * instead of racing through the transition check. Completing cancels the
 * reminder schedule; reopening re-schedules it. Both paths write their
 * outbox event in the same transaction.
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

  let completedNow = false;
  let completedType: string | null = null;
  const db = getDb();
  const result = await db.transaction(async (tx) => {
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
    const saved = await saveActivityStatus(
      userId,
      activityId,
      status,
      status === "completed" ? new Date() : null,
      tx,
    );

    if (status === "completed") {
      completedNow = true;
      completedType = saved.type;
      await cancelReminderScheduleInTx(tx, activityId);
      await insertOutboxEvent(tx, {
        userId,
        eventType: "activity.completed",
        eventKey: `activity.completed:${activityId}:${crypto.randomUUID()}`,
        payload: { activityId },
      });
    } else if (row.status === "completed") {
      // Reopened: reminders come back with a fresh deadline version.
      const emailEnabled = await getReminderEmailEnabled(tx, userId);
      await createReminderScheduleInTx(
        tx,
        userId,
        toScheduleActivity(saved),
        emailEnabled,
      );
      await insertOutboxEvent(tx, {
        userId,
        eventType: "activity.updated",
        eventKey: `activity.reopened:${activityId}:${crypto.randomUUID()}`,
        payload: { activityId },
      });
    }
    return saved;
  });
  if (completedNow) {
    await trackEvent(userId, "activity_completed", { type: completedType ?? "other" });
  }
  return result;
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
