import { and, count, desc, eq, isNull, lte, max, sql } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { profiles, reminders } from "~/lib/db/schema";
import type { ReminderChannel } from "~/lib/queue/job-ids";

const db = getDb();

export type ReminderRow = typeof reminders.$inferSelect;
export type ReminderStatus = ReminderRow["status"];
export type ReminderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether the user enabled email reminders, read inside the caller's
 * transaction so activity writes can decide which channels to schedule
 * without a second, un-fenced read.
 */
export async function getReminderEmailEnabled(
  tx: ReminderTx,
  userId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ settings: profiles.settings })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const settings = (row?.settings ?? {}) as {
    reminders?: { emailEnabled?: boolean };
  };
  return settings.reminders?.emailEnabled === true;
}

export type ReminderInsert = {
  id: string;
  userId: string;
  activityId: string | null;
  deadlineVersion: number | null;
  title: string;
  message: string | null;
  remindAt: Date;
  channel: ReminderChannel;
  idempotencyKey: string;
  jobId: string | null;
};

/** Inserts reminder rows inside the caller's transaction. */
export async function insertReminders(
  tx: ReminderTx,
  rows: ReminderInsert[],
): Promise<ReminderRow[]> {
  if (rows.length === 0) {
    return [];
  }
  return tx.insert(reminders).values(rows).returning();
}

export async function findReminderById(
  reminderId: string,
): Promise<ReminderRow | undefined> {
  const [row] = await db
    .select()
    .from(reminders)
    .where(eq(reminders.id, reminderId))
    .limit(1);
  return row;
}

export async function findScheduledRemindersForActivity(
  activityId: string,
): Promise<ReminderRow[]> {
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.activityId, activityId),
        eq(reminders.status, "scheduled"),
      ),
    )
    .orderBy(reminders.remindAt);
}

/**
 * Scheduled reminders whose delivery time has arrived. Used by the
 * reconciliation loop after Redis recovery (or a missed enqueue) to put the
 * delivery job back on the queue; the deterministic job id keeps re-enqueues
 * idempotent.
 */
export async function findDueScheduledReminders(
  limit: number,
  now: Date,
): Promise<ReminderRow[]> {
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.status, "scheduled"),
        lte(reminders.remindAt, now),
      ),
    )
    .orderBy(reminders.remindAt)
    .limit(limit);
}

/** Marks every scheduled reminder of an activity cancelled, inside the tx. */
export async function cancelScheduledRemindersForActivity(
  tx: ReminderTx,
  activityId: string,
): Promise<number> {
  const rows = await tx
    .update(reminders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(reminders.activityId, activityId),
        eq(reminders.status, "scheduled"),
      ),
    )
    .returning({ id: reminders.id });
  return rows.length;
}

/** Refreshes the title snapshot on an activity's pending reminders. */
export async function updateReminderTitles(
  tx: ReminderTx,
  activityId: string,
  title: string,
): Promise<void> {
  await tx
    .update(reminders)
    .set({ title, updatedAt: new Date() })
    .where(eq(reminders.activityId, activityId));
}

/**
 * Next deadline version for an activity's reminders: 1 for a fresh schedule,
 * incremented on every reschedule so deterministic job ids never collide
 * with a previous schedule's ids.
 */
export async function nextDeadlineVersion(
  tx: ReminderTx,
  activityId: string,
): Promise<number> {
  const [row] = await tx
    .select({ value: max(reminders.deadlineVersion) })
    .from(reminders)
    .where(eq(reminders.activityId, activityId));
  return (row?.value ?? 0) + 1;
}

/**
 * Marks a reminder delivered. The conditional update wins only when the row
 * is still scheduled, so a stale worker (activity completed, reminder
 * rescheduled/cancelled, or a duplicate delivery) is a no-op — the fence
 * that makes at-least-once execution safe.
 */
export async function markReminderSent(
  reminderId: string,
): Promise<ReminderRow | undefined> {
  const [row] = await db
    .update(reminders)
    .set({
      status: "sent",
      sentAt: new Date(),
      attempts: sql`${reminders.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(reminders.id, reminderId), eq(reminders.status, "scheduled")),
    )
    .returning();
  return row;
}

/** Same fence as markReminderSent, for permanent delivery failures. */
export async function markReminderFailed(
  reminderId: string,
): Promise<ReminderRow | undefined> {
  const [row] = await db
    .update(reminders)
    .set({
      status: "failed",
      failedAt: new Date(),
      attempts: sql`${reminders.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(reminders.id, reminderId), eq(reminders.status, "scheduled")),
    )
    .returning();
  return row;
}

/** In-app reminders delivered but not yet read, newest first. */
export async function listUnreadInAppReminders(
  userId: string,
  limit = 50,
): Promise<ReminderRow[]> {
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.channel, "in_app"),
        eq(reminders.status, "sent"),
        isNull(reminders.readAt),
      ),
    )
    .orderBy(desc(reminders.sentAt), desc(reminders.remindAt))
    .limit(limit);
}

export async function countUnreadInAppReminders(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.channel, "in_app"),
        eq(reminders.status, "sent"),
        isNull(reminders.readAt),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function markReminderRead(
  userId: string,
  reminderId: string,
): Promise<ReminderRow | undefined> {
  const [row] = await db
    .update(reminders)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)))
    .returning();
  return row;
}

/** Recent reminders of any channel/status, for the settings page. */
export async function listRecentReminders(
  userId: string,
  limit = 20,
): Promise<ReminderRow[]> {
  return db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(desc(reminders.remindAt), desc(reminders.createdAt))
    .limit(limit);
}
