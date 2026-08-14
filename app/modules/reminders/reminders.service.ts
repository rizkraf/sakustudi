import { eq } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { profiles, user } from "~/lib/db/schema";
import { sendReminderEmail } from "~/lib/mail/mailer";
import { DEADLINE_TIME_ZONE } from "~/lib/time/deadlines";
import {
  buildReminderMessage,
  calculateReminderTimes,
} from "~/lib/time/reminders";
import { dispatchReminder } from "~/lib/queue/publish";
import { buildReminderJobId } from "~/lib/queue/job-ids";
import type { ReminderJobPayload } from "~/lib/queue/job-ids";
import {
  cancelScheduledRemindersForActivity,
  findDueScheduledReminders,
  findReminderById,
  findScheduledRemindersForActivity,
  insertReminders,
  listRecentReminders,
  listUnreadInAppReminders,
  markReminderFailed,
  markReminderRead,
  markReminderSent,
  nextDeadlineVersion,
  updateReminderTitles,
  type ReminderInsert,
  type ReminderRow,
  type ReminderTx,
} from "./reminders.repository";
import { findActivityForReminder } from "~/modules/activities/activities.repository";

const db = getDb();

export type { ReminderRow, ReminderJobPayload };

export type Reminder = ReminderRow;

export type ReminderScheduleActivity = {
  id: string;
  userId: string;
  title: string;
  dueDate: Date | null;
  status: "pending" | "in_progress" | "completed";
};

export type ReminderPreferences = {
  emailEnabled: boolean;
};

/**
 * Reminder preferences live in profiles.settings.reminders. A missing
 * profile or missing settings object reads as the default (email off).
 */
export async function getReminderPreferences(
  userId: string,
): Promise<ReminderPreferences> {
  const [row] = await db
    .select({ settings: profiles.settings })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const settings = (row?.settings ?? {}) as {
    reminders?: { emailEnabled?: boolean };
  };
  return { emailEnabled: settings.reminders?.emailEnabled === true };
}

/**
 * Persists the email-reminder preference. The profile row may not exist
 * (sign-up does not create one), so the write upserts and merges the nested
 * settings object instead of overwriting unrelated settings.
 */
export async function setReminderPreferences(
  userId: string,
  preferences: ReminderPreferences,
): Promise<void> {
  const settings: { reminders: { emailEnabled: boolean } } = {
    reminders: { emailEnabled: preferences.emailEnabled },
  };
  await db
    .insert(profiles)
    .values({ userId, settings })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { settings, updatedAt: new Date() },
    });
}

/**
 * Schedules the reminder rows for an activity inside the caller's
 * transaction. Times come from calculateReminderTimes (3-day/1-day at 09:00
 * Asia/Jakarta, past times skipped); an in_app row is always created per
 * time, plus an email row when the user enabled email reminders. Every
 * schedule creation bumps the deadline version so deterministic job ids
 * never collide with a previous schedule's.
 */
export async function createReminderScheduleInTx(
  tx: ReminderTx,
  userId: string,
  activity: ReminderScheduleActivity,
  emailEnabled: boolean,
): Promise<Reminder[]> {
  if (activity.dueDate === null) {
    return [];
  }
  const times = calculateReminderTimes(activity.dueDate, DEADLINE_TIME_ZONE);
  if (times.length === 0) {
    return [];
  }

  const version = await nextDeadlineVersion(tx, activity.id);
  const rows: ReminderInsert[] = [];
  for (const remindAt of times) {
    const message = buildReminderMessage(
      activity.title,
      remindAt,
      activity.dueDate,
      DEADLINE_TIME_ZONE,
    );
    for (const channel of emailEnabled
      ? (["in_app", "email"] as const)
      : (["in_app"] as const)) {
      const id = crypto.randomUUID();
      rows.push({
        id,
        userId,
        activityId: activity.id,
        deadlineVersion: version,
        title: activity.title,
        message,
        remindAt,
        channel,
        idempotencyKey: `activity:${activity.id}:v${version}:${channel}:${remindAt.getTime()}`,
        jobId: buildReminderJobId(id, version, channel),
      });
    }
  }
  return insertReminders(tx, rows);
}

/**
 * Public form of createReminderScheduleInTx with the user's email preference
 * read in the same transaction.
 */
export async function createReminderSchedule(
  userId: string,
  activity: ReminderScheduleActivity,
): Promise<Reminder[]> {
  const emailEnabled = (await getReminderPreferences(userId)).emailEnabled;
  return db.transaction((tx) =>
    createReminderScheduleInTx(tx, userId, activity, emailEnabled),
  );
}

/**
 * Cancels every scheduled reminder of an activity. Used when the activity is
 * completed (brief: "activity completion cancels") or its deadline changed.
 */
export async function cancelReminderSchedule(
  _userId: string,
  activityId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await cancelReminderScheduleInTx(tx, activityId);
  });
}

export async function cancelReminderScheduleInTx(
  tx: ReminderTx,
  activityId: string,
): Promise<number> {
  return cancelScheduledRemindersForActivity(tx, activityId);
}

/**
 * Delivers one reminder job (worker entry point). The reminder row must
 * still be scheduled and its activity must exist and not be completed —
 * completed, deleted, or rescheduled activities never receive stale
 * reminders. Delivery is fenced by a conditional update:
 *
 * - in_app: the row becomes the in-app reminder state (status sent).
 * - email: the actual SMTP send happens on the emails queue (3 attempts,
 *   exponential backoff) so failures retry without re-running the state
 *   check; this job only enqueues that send.
 */
export async function sendReminder(job: ReminderJobPayload): Promise<void> {
  const reminder = await findReminderById(job.reminderId);
  if (!reminder || reminder.status !== "scheduled") {
    return;
  }
  if (reminder.userId !== job.userId) {
    return;
  }

  if (reminder.activityId !== null) {
    const activity = await findActivityForReminder(reminder.activityId);
    if (!activity || activity.status === "completed") {
      return;
    }
  }

  if (job.channel === "email") {
    await dispatchReminder(reminder);
    return;
  }

  await markReminderSent(reminder.id);
}

/**
 * Sends the reminder email (emails-queue worker entry point) and records the
 * outcome. The send runs on every retry; only the first conditional update
 * flips the row to sent/failed, so a retry after a partial send cannot
 * double-mark or resurrect a failed reminder.
 */
export async function deliverReminderEmail(
  reminderId: string,
): Promise<void> {
  const reminder = await findReminderById(reminderId);
  if (!reminder || reminder.status !== "scheduled") {
    return;
  }
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, reminder.userId))
    .limit(1);
  if (!row) {
    throw new Error("User for reminder email no longer exists.");
  }
  try {
    await sendReminderEmail({
      to: row.email,
      title: reminder.title,
      message: reminder.message,
    });
    await markReminderSent(reminder.id);
  } catch (error) {
    await markReminderFailed(reminder.id);
    throw error;
  }
}

export {
  findDueScheduledReminders,
  findScheduledRemindersForActivity,
  listRecentReminders,
  listUnreadInAppReminders,
  markReminderRead,
  updateReminderTitles,
};
