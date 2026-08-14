import { Queue } from "bullmq";

import { getRedisConnection } from "./connection";
import { buildOutboxJobId, buildReminderJobId } from "./job-ids";
import type { ReminderJobPayload } from "./job-ids";
import { JOB_NAMES, QUEUE_NAMES } from "./names";
import { findOutboxEvent } from "~/modules/outbox/outbox.repository";
import { findScheduledRemindersForActivity } from "~/modules/reminders/reminders.repository";

export type { ReminderJobPayload } from "./job-ids";

const EMAIL_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
};

function delayUntil(remindAt: Date): number {
  const ms = remindAt.getTime() - Date.now();
  return ms > 0 ? ms : 0;
}

export type ReminderForDispatch = {
  id: string;
  userId: string;
  channel: string;
  deadlineVersion: number | null;
  remindAt: Date;
};

/**
 * Publishes the delivery jobs for one outbox event to Redis, keyed by
 * deterministic job ids so duplicate publication is harmless. The payloads
 * carry only ids and metadata — never note or file contents. Runs strictly
 * after the database transaction that wrote the outbox row commits, so it
 * never enqueues inside a transaction.
 *
 * Reminder events enqueue one job per scheduled reminder row:
 * - in_app reminders go to the reminders queue (worker-side state check).
 * - email reminders go to the emails queue (3 attempts + exponential backoff).
 * Completed-activity events enqueue nothing: their reminders were cancelled
 * in the same transaction.
 */
export async function enqueueOutboxEvent(eventId: string): Promise<void> {
  const event = await findOutboxEvent(eventId);
  if (!event) {
    // The row may have been deleted between publication and dispatch; the
    // event is already in a terminal state or gone, so there is nothing to
    // publish.
    return;
  }
  if (event.eventType === "activity.completed") {
    return;
  }
  if (
    event.eventType !== "activity.created" &&
    event.eventType !== "activity.updated"
  ) {
    return;
  }

  const payload = event.payload as { activityId?: string };
  if (typeof payload.activityId !== "string") {
    return;
  }

  const reminders = await findScheduledRemindersForActivity(payload.activityId);
  for (const reminder of reminders) {
    await dispatchReminder(reminder);
  }
}

/**
 * Enqueues one reminder's delivery job on the queue for its channel.
 * Deterministic jobId + BullMQ's existing-jobId ignore makes concurrent
 * publishers and reconciliation-safe re-enqueues idempotent.
 */
export async function dispatchReminder(reminder: ReminderForDispatch): Promise<void> {
  const channel = reminder.channel === "email" ? "email" : "in_app";
  const job: ReminderJobPayload = {
    reminderId: reminder.id,
    userId: reminder.userId,
    channel,
  };
  const jobId = buildReminderJobId(
    reminder.id,
    reminder.deadlineVersion ?? 1,
    channel,
  );
  const queue = new Queue(
    channel === "email" ? QUEUE_NAMES.emails : QUEUE_NAMES.reminders,
    { connection: getRedisConnection() },
  );
  try {
    // Re-dispatch after a remind_at change (deadline edit without a version
    // bump, or a fake-clock rewind) must take effect: BullMQ's jobId dedup
    // would otherwise ignore the fresh add while the previous delayed job
    // still exists. Removing the stale job first keeps the schedule honest;
    // the worker-side state check remains the final guard against stale
    // deliveries.
    await queue.remove(jobId).catch(() => undefined);
    await queue.add(
      channel === "email" ? JOB_NAMES.sendEmail : JOB_NAMES.sendReminder,
      job,
      {
        jobId,
        delay: delayUntil(reminder.remindAt),
        ...(channel === "email" ? EMAIL_JOB_OPTS : { attempts: 1 }),
      },
    );
  } finally {
    await queue.close();
  }
}

/** Job id used when the reconciliation loop re-enqueues the publisher. */
export function buildPublishOutboxJobId(): string {
  return buildOutboxJobId("publish-pending");
}
