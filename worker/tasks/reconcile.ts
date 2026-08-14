import { Queue, type Job } from "bullmq";

import { getRedisConnection } from "~/lib/queue/connection";
import {
  CLEANUP_INTERVAL_MS,
  JOB_NAMES,
  QUEUE_NAMES,
  RECONCILE_INTERVAL_MS,
} from "~/lib/queue/names";
import { dispatchReminder } from "~/lib/queue/publish";
import { findDueScheduledReminders } from "~/modules/reminders/reminders.repository";
import { resetStaleProcessing } from "~/modules/outbox/outbox.repository";
import { publishPendingOutbox } from "~/modules/outbox/outbox.service";
import { PUBLISH_OUTBOX_JOB_ID } from "./publish-outbox";

export type ReconcilePayload = Record<string, never>;

export const RECONCILE_JOB_ID = "reconcile-loop";
export const CLEANUP_JOB_ID = "cleanup-loop";

const RECONCILE_LIMIT = 100;
const REMINDER_LIMIT = 200;

/**
 * Reconciliation after Redis recovery (or any missed run):
 *
 * 1. Resets stale "processing" outbox claims (lease expired) to pending.
 * 2. Publishes pending outbox events (deterministic job ids make re-publish
 *    harmless).
 * 3. Re-enqueues due scheduled reminders that are not on the queue (the job
 *    id dedup keeps this idempotent).
 * 4. Re-arms the next reconcile and the periodic storage cleanup.
 *
 * The loop job id is fixed, so overlapping runs collapse into one.
 */
export async function runReconcile(
  _job: Job<ReconcilePayload>,
): Promise<void> {
  void _job;
  const now = new Date();

  await resetStaleProcessing(now);
  await publishPendingOutbox(RECONCILE_LIMIT);

  const due = await findDueScheduledReminders(REMINDER_LIMIT, now);
  for (const reminder of due) {
    await dispatchReminder(reminder);
  }
}

export const MAINTENANCE_JOB_OPTS = {
  attempts: 1,
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * Enqueues the next reconcile and the next cleanup with fixed ids + delays.
 * Safe to call from worker "completed"/"failed" event listeners: the job
 * that just finished has `removeOnComplete`/`removeOnFail` set, so its fixed
 * id is free for the next cycle. Called from the loop, never from inside a
 * maintenance handler (adding a job with the id of the currently-active job
 * would be ignored by BullMQ's deduplication and silently kill the loop).
 */
export async function armMaintenanceJobs(): Promise<void> {
  const connection = getRedisConnection();
  const remindersQueue = new Queue(QUEUE_NAMES.reminders, { connection });
  const cleanupQueue = new Queue(QUEUE_NAMES.cleanup, { connection });
  try {
    await remindersQueue.add(JOB_NAMES.reconcile, {}, {
      ...MAINTENANCE_JOB_OPTS,
      jobId: RECONCILE_JOB_ID,
      delay: RECONCILE_INTERVAL_MS,
    });
    await cleanupQueue.add(JOB_NAMES.cleanupStorage, {}, {
      ...MAINTENANCE_JOB_OPTS,
      jobId: CLEANUP_JOB_ID,
      delay: CLEANUP_INTERVAL_MS,
    });
    // Re-arm the publisher separately so a slow reconcile cannot delay it.
    await remindersQueue.add(JOB_NAMES.publishOutbox, { limit: RECONCILE_LIMIT }, {
      ...MAINTENANCE_JOB_OPTS,
      jobId: PUBLISH_OUTBOX_JOB_ID,
      delay: Math.min(RECONCILE_INTERVAL_MS, 30_000),
    });
  } finally {
    await Promise.allSettled([remindersQueue.close(), cleanupQueue.close()]);
  }
}
