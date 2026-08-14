/**
 * Deterministic BullMQ job ids. Publishing the same logical event twice
 * (publisher retry, reconciliation after Redis recovery, duplicate outbox
 * rows) resolves to the same jobId, and BullMQ silently ignores a re-add of
 * an existing jobId — deduplication without a lock or an existence check.
 */

export type ReminderChannel = "in_app" | "email";

/**
 * Payload of a reminder delivery job. Ids and metadata only — the worker
 * loads title, message, and user email from the database, so queue contents
 * never carry private data.
 */
export type ReminderJobPayload = {
  reminderId: string;
  userId: string;
  channel: ReminderChannel;
};

/**
 * Job id for one reminder delivery. The deadline version is part of the id so
 * a rescheduled deadline (which bumps the version and recreates the reminder
 * rows) never reuses the old id. BullMQ forbids `:` in custom ids, so the
 * separator is `-`.
 */
export function buildReminderJobId(
  reminderId: string,
  deadlineVersion: number,
  channel: ReminderChannel,
): string {
  return `reminder-${reminderId}-v${deadlineVersion}-${channel}`;
}

/** Job id for publishing one outbox event. */
export function buildOutboxJobId(eventId: string): string {
  return `outbox-${eventId}`;
}
