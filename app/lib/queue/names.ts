export const QUEUE_NAMES = {
  reminders: "reminders",
  emails: "emails",
  exports: "exports",
  cleanup: "cleanup",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  publishOutbox: "publish-outbox",
  sendReminder: "send-reminder",
  sendEmail: "send-email",
  reconcile: "reconcile",
  cleanupStorage: "cleanup-storage",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/**
 * Scheduled reminder cadence: remind 3 days and 1 day before the deadline at
 * 09:00 in the user's timezone (Asia/Jakarta for Sakustudi). Exported so the
 * unit tests pin the exact values.
 */
export const REMINDER_OFFSET_DAYS = [3, 1] as const;
export const REMINDER_TIME_ZONE = "Asia/Jakarta";
export const REMINDER_HOUR = 9;
export const REMINDER_MINUTE = 0;

/** Recurring reconcile cadence (ms). Shortened via env in e2e. */
export const RECONCILE_INTERVAL_MS = Number(
  process.env.RECONCILE_INTERVAL_MS ?? 60_000,
);
/** Cleanup cadence (ms). */
export const CLEANUP_INTERVAL_MS = Number(
  process.env.CLEANUP_INTERVAL_MS ?? 60 * 60_000,
);
